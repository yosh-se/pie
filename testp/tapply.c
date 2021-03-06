#include <stdio.h>
#include <stdlib.h>
#include "../pie_types.h"
#include "../bm/pie_bm.h"
#include "../io/pie_io.h"
#include "../lib/timing.h"
#include "../encoding/pie_rgba.h"
#include "../alg/pie_hist.h"
#include "../editd/pie_render.h"

int main(int argc, char** argv)
{
        struct pie_bitmap_f32rgb img;
        struct pie_bitmap_u8rgb out;
        struct timing t;
        struct pie_dev_settings settings;
        struct pie_histogram hist;
        char* out_name = "out.jpg";
        float* buf;
        time_t dur;
        int ret;

        if (argc != 2)
        {
                printf("Usage contr filename\n");
                return -1;
        }

        timing_start(&t);
        ret = pie_io_load(&img, argv[1], NULL);
        dur = timing_dur_usec(&t);
        if (ret)
        {
                printf("Error loading media: %d\n", ret);
                return -1;
        }
        printf("Loaded media in %luusec\n", dur);

        buf = malloc(img.width * img.row_stride * sizeof(float) + 8);
        pie_dev_init_settings(&settings, img.width, img.height);

        settings.saturation = 1.3f;
        //settings.vibrance = 0.3f;
        pie_dev_render(&img, buf, &settings);
        
        timing_start(&t);
        pie_bm_conv_bd(&out, PIE_COLOR_8B,
                       &img, PIE_COLOR_32B);
        dur = timing_dur_usec(&t);
        printf("Converted media to 8bit in %luusec\n", dur);

        timing_start(&t);
        pie_io_jpg_u8rgb_write(out_name, &out, 95);
        dur = timing_dur_usec(&t);
        printf("Wrote %s in %luusec\n", out_name, dur);

        timing_start(&t);
        pie_enc_bm_rgba((unsigned char*)buf, &img, PIE_IMAGE_TYPE_PRIMARY);
        dur = timing_dur_usec(&t);
        printf("RGBA encode in %luusec\n", dur);

        timing_start(&t);
        pie_alg_hist_lum(&hist, &img);
        dur = timing_dur_usec(&t);
        printf("Created LUM hist in %luusec\n", dur);

        timing_start(&t);
        pie_alg_hist_rgb(&hist, &img);
        dur = timing_dur_usec(&t);
        printf("Created RGB hist in %luusec\n", dur);        
        
        free(buf);
        pie_bm_free_f32(&img);
        pie_bm_free_u8(&out);

        return 0;
}
