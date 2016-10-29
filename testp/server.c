/*
* Copyright (C) 2016 Fredrik Skogman, skogman - at - gmail.com.
* This file is part of pie project
*
* The contents of this file are subject to the terms of the Common
* Development and Distribution License (the "License"). You may not use this
* file except in compliance with the License. You can obtain a copy of the
* License at http://opensource.org/licenses/CDDL-1.0. See the License for the
* specific language governing permissions and limitations under the License. 
* When distributing the software, include this License Header Notice in each
* file and include the License file at http://opensource.org/licenses/CDDL-1.0.
*/

#include "../wsrv/pie_server.h"
#include "../lib/chan.h"
#include "../lib/timing.h"
#include "../msg/pie_msg.h"
#include "../pie_types.h"
#include "../pie_bm.h"
#include "../pie_log.h"
#include "../pie_render.h"
#include <stdio.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <unistd.h>
#include <assert.h>
#include <string.h>

struct pie_server server;

/**
 * Signal handler.
 * @param the signum.
 * @return void.
 */
static void sig_h(int);

/**
 * Main event handling loop
 * @param struct server.
 * @return NULL if successfull.
 */
static void* ev_loop(void*);

/**
 * Interrupt handler.
 * @param struct server.
 * @return NULL if successfull.
 */
static void* i_handler(void*);

/**
 * Callback. Loads an image.
 * Path is provided in buf.
 * @param message to act on.
 * @return if the message should be retransmit, the new msg type,
 *         if message should be dropped, PIE_MSG_INVALID.
 */
static enum pie_msg_type cb_msg_load(struct pie_msg*);

/**
 * Callback. Update an image and renders the image.
 * @param message to acton.
 * @return if the message should be retransmit, the new msg type,
 *         if message should be dropped, PIE_MSG_INVALID.
 */
static enum pie_msg_type cb_msg_render(struct pie_msg*);

/**
 * Encode the proxy_out into rgba format.
 * @param the image workspace to encode.
 * @return void
 */
static void encode_rgba(struct pie_img_workspace*);

int main(void)
{
        pthread_t thr_ev_loop;
        pthread_t thr_int;
        sigset_t b_sigset;
        void* ret;
        int ok;

        server.context_root = "assets";
        server.port = 8080;
        server.command = chan_create();
        server.response = chan_create();

        /* interrupt handler thread */
        ok = pthread_create(&thr_int,
                            NULL,
                            &i_handler,
                            (void*) &server);
        if (ok)
        {
                PIE_LOG("pthread_create:thr_int: %d", ok);
                goto cleanup;

        }

        /* Block all signals during thread creating */
        sigfillset(&b_sigset);
        pthread_sigmask(SIG_BLOCK, &b_sigset, NULL);

        /* Create a pool of worker threads for IO */
        /* Create a pool of worker threads for render */

        /* event loop thread */
        ok = pthread_create(&thr_ev_loop,
                            NULL,
                            &ev_loop,
                            (void*) &server);
        if (ok)
        {
                PIE_LOG("pthread_create:thr_ev_loop: %d", ok);
                goto cleanup;

        }

        server.run = 1;
        if (start_server(&server))
        {
                PIE_ERR("Failed");
        }

        
        PIE_LOG("Shutdown main.");
        ok = 1;
        chan_close(server.command);
        chan_close(server.response);
        
        pthread_join(thr_int, &ret);
        if (ret)
        {
                ok = 0;
                PIE_ERR("Interrupt handler reported error.");
        }
        pthread_join(thr_ev_loop, &ret);
        if (ret)
        {
                ok = 0;
                PIE_ERR("Event loop reported error.");
        }

        if (ok)
        {
                PIE_LOG("All services exited cleanly.");
        }
cleanup:
        chan_destroy(server.command);
        chan_destroy(server.response);

        return 0;
}

static void sig_h(int signum)
{
        if (signum == SIGINT)
        {
                server.run = 0;
        }
}

static void* i_handler(void* a)
{
        struct sigaction sa;
        struct pie_server* s = (struct pie_server*)a;
        void* ret = NULL;

        /* Set up signal handler */
        sa.sa_handler = &sig_h;
        sa.sa_flags = 0;
        sigfillset(&sa.sa_mask);
        if (sigaction(SIGINT, &sa, NULL))
        {
                perror("i_handler::sigaction");
                return (void*)0x1L;
        }
        
        pause();
        PIE_DEBUG("Leaving.");
        s->run = 0;

        return ret;
}

static void* ev_loop(void* a)
{
        struct chan_msg msg;
        struct pie_server* s = (struct pie_server*)a;
        void* ret = NULL;

        PIE_DEBUG("Ready for messages.");

        while (s->run)
        {
                /* Select on multiple channels,
                   after a load issue the response will appear*/
                int n = chan_read(s->command, &msg, -1);

                PIE_TRACE("Got chan_read: %d", n);

                if (n == 0)
                {
                        struct pie_msg* cmd = (struct pie_msg*)msg.data;
                        struct timing t_proc;
                        struct timing t_enc;
                        int processed = 1;
                        enum pie_msg_type new = PIE_MSG_INVALID;

                        if (msg.len != sizeof(struct pie_msg))
                        {
                                PIE_WARN("invalid message received.");
                                continue;
                        }
                        PIE_DEBUG("[%s] received message %d.",
                               cmd->token,
                               cmd->type);

                        timing_start(&t_proc);
                        switch (cmd->type)
                        {
                        case PIE_MSG_LOAD:
                                new = cb_msg_load(cmd);
                                break;
                        case PIE_MSG_SET_CONTRAST:
                        case PIE_MSG_SET_ESPOSURE:
                        case PIE_MSG_SET_HIGHL:
                        case PIE_MSG_SET_SHADOW:
                        case PIE_MSG_SET_WHITE:
                        case PIE_MSG_SET_BLACK:
                        case PIE_MSG_SET_CLARITY:
                        case PIE_MSG_SET_VIBRANCE:
                        case PIE_MSG_SET_SATURATION:
                        case PIE_MSG_SET_ROTATE:
                                new = cb_msg_render(cmd);
                                timing_start(&t_enc);
                                encode_rgba(cmd->img);
                                PIE_DEBUG("Encoded proxy in %ldusec.",
                                          timing_dur_usec(&t_enc));
                                
                                break;
                        default:
                                processed = 0;
                                PIE_WARN("Unknown message %d.", 
                                         cmd->type);
                        }
                        if (processed)
                        {
                                PIE_DEBUG("Processed message %d in %ldusec.",
                                          cmd->type,
                                          timing_dur_usec(&t_proc));
                        }
                        if (new != PIE_MSG_INVALID)
                        {
                                /* It is safe to re-transmit the
                                   message. It's the receiver's
                                   responsibility to free any message */
                                cmd->type = new;
                                if (chan_write(s->response, &msg))
                                {
                                        PIE_ERR("Failed to send response %d.",
                                                cmd->type);
                                }
                        }
                        else
                        {
                                /* Message was not properly handled
                                   Free it. */
                                pie_msg_free(cmd);
                        }
                }
                else if (n == EBADF)
                {
                        /* Channel closed */
                        break;
                }
                else if (n != EAGAIN)
                {
                        PIE_ERR("Channel reported error.");
                        ret = (void*)0x1L;
                        break;
                }
        }

        PIE_DEBUG("Leaving.");

        return ret;
}

/*
 * Create a new img work space.
 * Read file from path in buf.
 */
static enum pie_msg_type cb_msg_load(struct pie_msg* msg)
{
        int width = 640;
        int height = 100;
        unsigned int row_stride;
        unsigned int len;
        float step = width / 255.0f;
        assert(msg->img == NULL);

        /* HACK */
        msg->img = malloc(sizeof(struct pie_img_workspace));
        memset(msg->img, 0, sizeof(struct pie_img_workspace));
        pie_img_init_settings(&msg->img->settings);
        msg->img->raw.width = width;
        msg->img->raw.height = height;
        msg->img->raw.color_type = PIE_COLOR_TYPE_RGB;
        bm_alloc_f32(&msg->img->raw);
        msg->img->proxy_out_len = msg->img->raw.width * msg->img->raw.height * 4;
        msg->img->buf = malloc(msg->img->proxy_out_len + PROXY_RGBA_OFF);
        msg->img->proxy_out_rgba = msg->img->buf + PROXY_RGBA_OFF;
        row_stride = msg->img->raw.row_stride;
        len = msg->img->raw.height * msg->img->raw.row_stride * sizeof(float);

        /* Create proxy versions */
        bm_conv_bd(&msg->img->proxy,
                   PIE_COLOR_32B,
                   &msg->img->raw,
                   PIE_COLOR_32B);
        bm_conv_bd(&msg->img->proxy_out,
                   PIE_COLOR_32B,
                   &msg->img->raw,
                   PIE_COLOR_32B);

        /* Init with linear gradient */
        for (unsigned int y = 0; y < msg->img->raw.height; y++)
        {
                for (unsigned int x = 0; x < msg->img->raw.width; x++)
                {
                        float f = (x / step) / 255.0f;

                        msg->img->raw.c_red[y * row_stride + x] = f;
                        msg->img->raw.c_green[y * row_stride + x] = f;
                        msg->img->raw.c_blue[y * row_stride + x] = f;
                }
        }        

        /* Copy raw to proxy */
        memcpy(msg->img->proxy.c_red, msg->img->raw.c_red, len);
        memcpy(msg->img->proxy.c_green, msg->img->raw.c_green, len);
        memcpy(msg->img->proxy.c_blue, msg->img->raw.c_blue, len);

        /* Copy proxy to proxy out */
        memcpy(msg->img->proxy_out.c_red, msg->img->proxy.c_red, len);
        memcpy(msg->img->proxy_out.c_green, msg->img->proxy.c_green, len);
        memcpy(msg->img->proxy_out.c_blue, msg->img->proxy.c_blue, len);

        /* Encode proxy rgba */
        encode_rgba(msg->img);

        /* Issue a load cmd */

        return PIE_MSG_LOAD_DONE;
}

static enum pie_msg_type cb_msg_render(struct pie_msg* msg)
{
        int status = 0;
        int resample = 0;
        
        switch (msg->type)
        {
        case PIE_MSG_SET_CONTRAST:
                if (msg->f1 < 0.0f || msg->f1 > 2.0f)
                {
                        PIE_WARN("[%s] invalid contrast: %f.",
                                 msg->token,
                                 msg->f1);
                        status = -1;
                }
                else
                {
                        msg->img->settings.contrast = msg->f1;
                }
                break;
        case PIE_MSG_SET_ESPOSURE:
        case PIE_MSG_SET_HIGHL:
        case PIE_MSG_SET_SHADOW:
        case PIE_MSG_SET_WHITE:
        case PIE_MSG_SET_BLACK:
        case PIE_MSG_SET_CLARITY:
        case PIE_MSG_SET_VIBRANCE:
        case PIE_MSG_SET_SATURATION:
        case PIE_MSG_SET_ROTATE:
                PIE_WARN("[%s] Not implemented yet %d.",
                         msg->token,
                         msg->type);
                status = -1;
                break;
        default:
                PIE_WARN("[%s] Invalid message: %d.",
                         msg->token,
                         msg->type);
                status = -1;
        }

        if (resample)
        {
                PIE_ERR("Resample not implemeted");
                abort();
        }

        if (status == 0)
        {
                struct timing t1;
                struct bitmap_f32rgb* org = &msg->img->proxy;
                struct bitmap_f32rgb* new = &msg->img->proxy_out;
                size_t len = org->height * org->row_stride * sizeof(float);
                int r_ok;
                
                /* Copy fresh proxy */
                timing_start(&t1);
                memcpy(new->c_red, org->c_red, len);
                memcpy(new->c_green, org->c_green, len);
                memcpy(new->c_blue, org->c_blue, len);
                PIE_DEBUG("Reset proxy in %ldusec.",
                          timing_dur_usec(&t1));
                
                r_ok = pie_img_render(new,
                                      NULL,
                                      &msg->img->settings);
                assert(r_ok == 0);
                
                return PIE_MSG_RENDER_DONE;
        }

        return PIE_MSG_INVALID;
}

static void encode_rgba(struct pie_img_workspace* img)
{
        unsigned char* p = img->proxy_out_rgba;
        unsigned int stride = img->raw.row_stride;

        for (unsigned int y = 0; y < img->proxy_out.height; y++)
        {
                for (unsigned int x = 0; x < img->proxy_out.width; x++)
                {
                        /* convert to sse */
                        unsigned char r, g, b;
                        
                        r = (unsigned char)(img->proxy_out.c_red[y * stride + x] * 255.0f);
                        g = (unsigned char)(img->proxy_out.c_green[y * stride + x] * 255.0f);
                        b = (unsigned char)(img->proxy_out.c_blue[y * stride + x] * 255.0f);
                        
                        *p++ = r;
                        *p++ = g;
                        *p++ = b;
                        *p++ = 255;
                }
        }        
}
