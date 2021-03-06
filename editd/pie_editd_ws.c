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

#include <libwebsockets.h>
#include "pie_editd_ws.h"
#include "pie_cmd.h"
#include "pie_msg.h"
#include "pie_wrkspc_mgr.h"
#include "../http/pie_session.h"
#include "../http/pie_util.h"
#include "../pie_log.h"
#include "../pie_types.h"
#include "../lib/chan.h"
#include "../lib/hmap.h"
#include "../lib/timing.h"
#include "../encoding/pie_json.h"
#include "../encoding/pie_rgba.h"

#define JSON_HIST_SIZE (10 * 1024)

#ifdef __sun
# include <note.h>
#else
# define NOTE(X)
#endif

enum pie_protocols
{
        PIE_PROTO_HTTP,
        PIE_PROTO_IMG,
        PIE_PROTO_HIST,
        PIE_PROTO_CMD,
        PIE_PROTO_COUNT
};

struct pie_ctx_http
{
        char post_data[256];
        char token[PIE_SESS_TOKEN_LEN];
        lws_filefd_type fd;
};

struct pie_ctx_img
{
        char token[PIE_SESS_TOKEN_LEN];
};

struct pie_ctx_hist
{
        char token[PIE_SESS_TOKEN_LEN];
};

struct pie_ctx_cmd
{
        char token[PIE_SESS_TOKEN_LEN];
};

/* Only one server can be executed at a time */
static struct pie_editd_ws* server = NULL;

/**
 * Callback methods.
 * @param The web-sockets instance.
 * @param The reason fro the callback.
 *        See libwebsockets/enum lws_callback_reasons for alternatives.
 * @param The per session context data.
 * @param Incoming data for this request. (Path for HTTP, data for WS etc).
 * @param Length of data for request.
 * @return 0 on sucess, negative otherwise.
 */
static int cb_http(struct lws* wsi,
                   enum lws_callback_reasons reason,
                   void* user,
                   void* in,
                   size_t len);
static int cb_img(struct lws* wsi,
                  enum lws_callback_reasons reason,
                  void* user,
                  void* in,
                  size_t len);
static int cb_hist(struct lws* wsi,
                   enum lws_callback_reasons reason,
                   void* user,
                   void* in,
                   size_t len);
static int cb_cmd(struct lws* wsi,
                  enum lws_callback_reasons reason,
                  void* user,
                  void* in,
                  size_t len);

static const struct lws_extension exts[] = {
        {
                "permessage-deflate",
                lws_extension_callback_pm_deflate,
                "permessage-deflate"
        },
        {
                "deflate-frame",
                lws_extension_callback_pm_deflate,
                "deflate_frame"
        },
        {NULL, NULL, NULL}
};
static struct lws_protocols protocols[] = {
        /* HTTP must be first */
        {
                "http-only", /* name */
                cb_http,     /* callback */
                sizeof(struct pie_ctx_http), /* ctx size */
                0,           /* max frame size / rx buffer */
                0,           /* id, not used */
                NULL         /* void* user data, let lws allocate */
        },
        {
                "pie-img",
                cb_img,
                sizeof(struct pie_ctx_img),
                0,
                0,
                NULL
        },
        {
                "pie-hist",
                cb_hist,
                sizeof(struct pie_ctx_hist),
                0,
                0,
                NULL
        },
        {
                "pie-cmd",
                cb_cmd,
                sizeof(struct pie_ctx_cmd),
                0,
                0,
                NULL
        },
        {NULL, NULL, 0, 0, 0, NULL}
};

int pie_editd_ws_start(struct pie_editd_ws* srv)
{
        struct lws_context_creation_info info;

        if (server)
        {
                PIE_ERR("One server is already active");
                return -1;
        }
        server = srv;

        memset(&info, 0, sizeof(info));
        info.port = srv->port;
        info.iface = NULL; /* all ifaces */
        info.ssl_cert_filepath = NULL;
        info.ssl_private_key_filepath = NULL;
        info.protocols = protocols;
        info.gid = -1;
        info.uid = -1;
        info.max_http_header_pool = 16;
        info.options = LWS_SERVER_OPTION_VALIDATE_UTF8;
        info.extensions = exts;
        info.timeout_secs = 5;
        info.ssl_cipher_list = "ECDHE-ECDSA-AES256-GCM-SHA384:"
                               "ECDHE-RSA-AES256-GCM-SHA384:"
                               "DHE-RSA-AES256-GCM-SHA384:"
                               "ECDHE-RSA-AES256-SHA384:"
                               "HIGH:!aNULL:!eNULL:!EXPORT:"
                               "!DES:!MD5:!PSK:!RC4:!HMAC_SHA1:"
                               "!SHA1:!DHE-RSA-AES128-GCM-SHA256:"
                               "!DHE-RSA-AES128-SHA256:"
                               "!AES128-GCM-SHA256:"
                               "!AES128-SHA256:"
                               "!DHE-RSA-AES256-SHA256:"
                               "!AES256-GCM-SHA384:"
                               "!AES256-SHA256";
        
        srv->sess_mgr = pie_sess_mgr_create();
        srv->context = lws_create_context(&info);
        if (srv->context == NULL)
        {
                return 1;
        }

        return 0;
}

int pie_editd_ws_service(void)
{
        int status;
        struct chan_msg msg;
        int n;

        /* Run state machine here */
        /* Receiver is responsible to free data */
        n = chan_read(server->response, &msg, 0);
        if (n == 0)
        {
                struct pie_msg* resp = (struct pie_msg*)msg.data;
                struct pie_sess* session;

                PIE_DEBUG("[%s] received message %d (RTT %ldusec).",
                          resp->token,
                          (int)resp->type,
                          timing_dur_usec(&resp->t));

                if (msg.len != sizeof(struct pie_msg))
                {
                        PIE_WARN("Invalid message received.");
                        goto msg_done;
                }

                session = pie_sess_mgr_get(server->sess_mgr, resp->token);
                if (session == NULL)
                {
                        PIE_ERR("[%s] sesion not found.",
                                resp->token);
                        goto msg_done;
                }
                switch (resp->type)
                {
                case PIE_MSG_LOAD_DONE:
                        /* On load done, a new image workspace
                           is created, store it in the session. */
                        session->wrkspc = resp->wrkspc;
                        NOTE(FALLTHRU)
                case PIE_MSG_RENDER_DONE:
                        /* Update session with tx ready */
                        session->tx_ready = (PIE_TX_IMG | PIE_TX_HIST);
                        lws_callback_on_writable_all_protocol(server->context,
                                                              &protocols[PIE_PROTO_IMG]);
                        lws_callback_on_writable_all_protocol(server->context,
                                                              &protocols[PIE_PROTO_HIST]);
                        break;
                default:
                        PIE_WARN("[%s] invalid message: %d",
                                 resp->token,
                                 (int)resp->type);
                }

        msg_done:
                pie_msg_free(msg.data);
        }
        else if (n != EAGAIN)
        {
                PIE_ERR("Error reading channel %d.", n);
                return -1;
        }

        /* Check for stop condition or img/hist is computed */
        /* If nothing to do, return after Xms */
        status = lws_service(server->context, 5);
        /* Reap sessions with inactivity for one hour */
        pie_sess_mgr_reap(server->sess_mgr, 60 * 60);

        return status;
}

int pie_editd_ws_stop(void)
{
        PIE_LOG("Shutdown server.");
        lws_context_destroy(server->context);
        pie_sess_mgr_destroy(server->sess_mgr);

        server = NULL;
        return 0;
}

static int cb_http(struct lws* wsi,
                   enum lws_callback_reasons reason,
                   void* user,
                   void* in,
                   size_t len)
{
        char url[256];
        unsigned char resp_headers[256];
        struct hmap* query_params = NULL;
        struct pie_sess* session = NULL;
        const char* mimetype;
        struct pie_ctx_http* ctx = (struct pie_ctx_http*)user;
        int hn = 0;
        int n;
        int ret;

        /* Set to true if callback should attempt to keep the connection
           open. */
        int try_keepalive = 0;

        switch (reason)
        {
        case LWS_CALLBACK_HTTP:
                try_keepalive = 1;
                query_params = pie_http_req_params(wsi);

                /* Look for existing session */
                session = get_session(server->sess_mgr, wsi);
                if (session == NULL)
                {
                        /* Create a new */
                        char cookie[128];
                        unsigned char* p = &resp_headers[0];

                        session = pie_sess_create();

                        hn = snprintf(cookie,
                                      128,
                                      "pie-session=%s;Max Age=3600",
                                      session->token);
                        if (lws_add_http_header_by_name(wsi,
                                                        (unsigned char*)"set-cookie:",
                                                        (unsigned char*)cookie,
                                                        hn,
                                                        &p,
                                                        resp_headers + 256))
                        {
                                /* Can't set header */
                                PIE_ERR("[%s] Can not write header",
                                        session->token);
                                goto bailout;
                        }

                        PIE_DEBUG("[%s] Init session",
                                  session->token);

                        pie_sess_mgr_put(server->sess_mgr, session);
                        /*
                         * This is usually safe. P should never be incremented
                         * more than the size of headers.
                         * P can never be decremented.
                         * But it's not beautiful, but needed to silence lint.
                         */
                        hn = (int)((unsigned long)p - (unsigned long)&resp_headers[0]);
                        strncpy(ctx->token,
                                session->token,
                                PIE_SESS_TOKEN_LEN);
                }

		if (len < 1)
                {
			lws_return_http_status(wsi,
                                               HTTP_STATUS_BAD_REQUEST,
                                               NULL);
                        PIE_DEBUG("[%s] Bad request, inpupt len %lu",
                                  session->token,
                                  len);
			goto keepalive;
		}

                PIE_LOG("Got url: '%s'", in);
                char* qv = hmap_get(query_params, "img");
                if (qv)
                {
                        PIE_LOG("img=%s", qv);
                }
                qv = hmap_get(query_params, "coll");
                if (qv)
                {
                        PIE_LOG("coll=%s", qv);
                }
                strcpy(url, server->directory);

                /* Get the URL */
                if (strcmp(in, "/"))
                {
                        /* File provided */
                        strncat(url, in, sizeof(url) - strlen(url) - 1);
                }
                else
                {
                        /* Get index page */
                        strcat(url, "/edit.html");
                }
                url[sizeof(url) - 1] = 0;
                mimetype = get_mimetype(url);
                PIE_LOG("[%s] GET %s",
                          session->token,
                          url);

		if (!mimetype)
                {
			lws_return_http_status(wsi,
                                               HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE,
                                               NULL);
                        PIE_DEBUG("[%s] Bad mime type: %s",
                                  session->token,
                                  mimetype);
                        goto keepalive;
		}

                /* Serve file async */
                n = lws_serve_http_file(wsi,
                                        url,
                                        mimetype,
                                        (char*)resp_headers,
                                        hn);
                if (n == 0)
                {
                        /* File is beeing served, but we can not
                           check for transaction completion yet */
                        try_keepalive = 0;
                }
                if (n < 0)
                {
                        PIE_WARN("[%s] Fail to send file '%s'",
                                 session->token,
                                 url);
                        goto bailout;
                }
                break;
        default:
                break;
        }

/* HTTP/1.1 or 2.0, default is to keepalive */
keepalive:
        ret = 0;

        if (try_keepalive)
        {
                if (lws_http_transaction_completed(wsi))
                {
                        char* token = "undef";

                        if (session)
                        {
                                token = session->token;
                        }
                        PIE_WARN("[%s] Failed to keep connection open",
                                 token);
                        goto bailout;
                }
        }

        goto cleanup;
bailout:
        ret = -1;
cleanup:
        if (query_params)
        {
                size_t h_size;
                struct hmap_entry* it = hmap_iter(query_params, &h_size);

                for (size_t i = 0; i < h_size; i++)
                {
                        PIE_LOG("Req params: %s=%s", it[i].key, it[i].data);
                        free(it[i].key);
                        free(it[i].data);
                }

                free(it);
                hmap_destroy(query_params);
        }

	return ret;
}

static int cb_img(struct lws* wsi,
                  enum lws_callback_reasons reason,
                  void* user,
                  void* in,
                  size_t len)
{
        struct pie_sess* session = NULL;
        struct pie_ctx_img* ctx = (struct pie_ctx_img*)user;
        int ret = 0;

        (void)len;

        if (user && reason != LWS_CALLBACK_ESTABLISHED)
        {
                session = pie_sess_mgr_get(server->sess_mgr, ctx->token);
        }

        switch (reason)
        {
        case LWS_CALLBACK_ESTABLISHED:
                /* Copy the session token, it is not available later on */
                if ((session = get_session(server->sess_mgr, wsi)))
                {
                        strcpy(ctx->token, session->token);
                }
                else
                {
                        PIE_WARN("No session found");
                        ret = -1;
                }
                break;
        case LWS_CALLBACK_SERVER_WRITEABLE:
                if (!session)
                {
                        PIE_WARN("No session found");
                        ret = -1;
                        break;
                }
                PIE_TRACE("[%s] tx_ready: 0x%x",
                          session->token,
                          session->tx_ready);

                if (session->tx_ready & PIE_TX_IMG)
                {
                        struct timing t;
                        uint32_t dur_ms;
                        int bw;

                        /* Allocate output buffer */
                        /* Outputbuffer format is duration,type,x,y,rgba data.
                         * Buffer is intented for raw copy on ws channel,
                         * so allocate extra space in the beginning for ws
                         * related data. */
                        timing_start(&t);
                        if (session->rgba == NULL)
                        {
                                session->rgba_len = (int)(session->wrkspc->proxy_out.width *
                                                          session->wrkspc->proxy_out.height *
                                                          4 + 4 * sizeof(uint32_t));
                                session->rgba = malloc(session->rgba_len + LWS_PRE);
                        }

                        /* Write type, w, h and data */
                        pie_enc_bm_rgba(session->rgba + LWS_PRE + sizeof(dur_ms),
                                        &session->wrkspc->proxy_out,
                                        PIE_IMAGE_TYPE_PRIMARY);
                        PIE_DEBUG("Encoded proxy:         %8ldusec",
                                  timing_dur_usec(&t));
                        /* Write server duration */
                        dur_ms = (uint32_t)timing_dur_msec(&session->t);
                        PIE_DEBUG("Server duration:       %8d000usec", dur_ms);
                        /* Make sure data is in network order */
                        dur_ms = htonl(dur_ms);
                        memcpy(session->rgba + LWS_PRE, &dur_ms, sizeof(dur_ms));
                        bw = lws_write(wsi,
                                       session->rgba + LWS_PRE,
                                       session->rgba_len,
                                       LWS_WRITE_BINARY);
                        if (bw < session->rgba_len)
                        {
                                PIE_ERR("[%s] ERROR write %d of %d",
                                        session->token,
                                        bw,
                                        session->rgba_len);
                                ret = -1;
                        }
                        session->tx_ready = (unsigned char)(session->tx_ready ^ PIE_TX_IMG);
                }
                break;
        case LWS_CALLBACK_RECEIVE:
                PIE_LOG("[%s] Got data: '%s'",
                        session->token,
                        (char*)in);

                break;
        default:
                break;
        }

        return ret;
}

static int cb_hist(struct lws* wsi,
                   enum lws_callback_reasons reason,
                   void* user,
                   void* in,
                   size_t len)
{
        struct pie_sess* session = NULL;
        struct pie_ctx_hist* ctx = (struct pie_ctx_hist*)user;
        int ret = 0;

        (void)len;

        if (user && reason != LWS_CALLBACK_ESTABLISHED)
        {
                session = pie_sess_mgr_get(server->sess_mgr, ctx->token);
        }

        switch (reason)
        {
        case LWS_CALLBACK_ESTABLISHED:
                /* Copy the session token, it is not available later on */
                if ((session = get_session(server->sess_mgr, wsi)))
                {
                        strcpy(ctx->token, session->token);

                }
                else
                {
                        PIE_WARN("No session found");
                        ret = -1;
                }
                break;
        case LWS_CALLBACK_SERVER_WRITEABLE:
                if (!session)
                {
                        PIE_WARN("No session found");
                        ret = -1;
                        break;
                }

                PIE_TRACE("[%s] tx_ready: 0x%x",
                          session->token,
                          session->tx_ready);

                if (session->tx_ready & PIE_TX_HIST)
                {
                        struct timing t;
                        unsigned char* buf;
                        int bw;
                        int json_len;

                        timing_start(&t);
                        buf = malloc(JSON_HIST_SIZE + LWS_PRE);
                        json_len = (int)pie_enc_json_hist((char*)buf + LWS_PRE,
                                                          JSON_HIST_SIZE,
                                                          &session->wrkspc->hist);
                        PIE_DEBUG("JSON encoded histogram: %8ldusec",
                                  timing_dur_usec(&t));
                        bw = lws_write(wsi,
                                       buf + LWS_PRE,
                                       json_len,
                                       LWS_WRITE_TEXT);
                        if (bw < json_len)
                        {
                                PIE_ERR("[%s] ERROR write %d of %d",
                                        session->token,
                                        bw,
                                        json_len);
                                ret = -1;
                        }
                        session->tx_ready = (unsigned char)(session->tx_ready ^ PIE_TX_HIST);
                        free(buf);
                }
                break;
        case LWS_CALLBACK_RECEIVE:
                PIE_LOG("[%s]Got data: '%s'",
                        session->token,
                        (char*)in);

                break;
        default:
                break;
        }

        return ret;
}

static int cb_cmd(struct lws* wsi,
                  enum lws_callback_reasons reason,
                  void* user,
                  void* in,
                  size_t len)
{
        struct chan_msg envelope;
        struct pie_sess* session = NULL;
        struct pie_msg* msg;
        struct pie_ctx_cmd* ctx = (struct pie_ctx_cmd*)user;
        int ret = 0;

        if (user && reason != LWS_CALLBACK_ESTABLISHED)
        {
                session = pie_sess_mgr_get(server->sess_mgr, ctx->token);
        }

        switch (reason)
        {
        case LWS_CALLBACK_ESTABLISHED:
                /* Copy the session token, it is not available later on */
                if ((session = get_session(server->sess_mgr, wsi)))
                {
                        strcpy(ctx->token, session->token);
                }
                else
                {
                        PIE_WARN("No session found");
                        return -1;
                }
                break;
        case LWS_CALLBACK_RECEIVE:
                if (!session)
                {
                        PIE_WARN("No session found");
                        return -1;
                }
                timing_start(&session->t);
                msg = pie_msg_alloc();
                strncpy(msg->token, session->token, PIE_MSG_TOKEN_LEN);
                if (parse_cmd_msg(msg, (char*)in, len))
                {
                        PIE_WARN("[%s] Failed to parse message: '%s'",
                                 session->token,
                                 (char*)in);
                        pie_msg_free(msg);
                }
                else
                {
                        if (msg->type == PIE_MSG_LOAD)
                        {
                                /* If a new image is being reloaded, free
                                   rgba buffer. */
                                if (session->rgba)
                                {
                                        PIE_TRACE("[%s] Reset RGBA output buffer",
                                                  session->token);
                                        free(session->rgba);
                                        session->rgba = NULL;
                                }
                        }
                        else if (session->wrkspc == NULL)
                        {
                                PIE_LOG("[%s] No image loaded",
                                       session->token);
                                goto done;
                        }
                        /* Copy image from session to message */
                        msg->wrkspc = session->wrkspc;
                        envelope.data = msg;
                        envelope.len = sizeof(struct pie_msg);
                        timing_start(&msg->t);

                        if (chan_write(server->command, &envelope))
                        {
                                PIE_ERR("[%s] Failed to write msg %d to chan",
                                        session->token,
                                        (int)msg->type);
                                pie_msg_free(msg);
                        }
                        else
                        {
                                NOTE(EMPTY)
                                PIE_DEBUG("[%s] Wrote message type %d to channel",
                                          session->token,
                                          (int)msg->type);
                        }
                }
                break;
        default:
                break;
        }

done:
        return ret;
}
