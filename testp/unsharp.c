#include <stdio.h>
#include "../pie_types.h"
#include "../bm/pie_bm.h"
#include "../io/pie_io.h"
#include "../lib/timing.h"
#include "../alg/pie_unsharp.h"

int main(int argc, char** argv)
{
        int ret;
        struct pie_bitmap_f32rgb img;
        struct pie_bitmap_u8rgb out;
        struct timing t;
        struct pie_unsharp_param p;
        time_t dur;
        
        //p.radius = 50.0f;
        p.radius = 1.0f;
        p.amount = 0.85f;    /* 0.3 to 0.7 is suitable values */
        p.threshold = 4.0f; /* typical 3 to 20 */

        if (argc != 2)
        {
                printf("Usage unsharp filename\n");
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

        timing_start(&t);

        printf("Using radius: %f\n", p.radius);
        
        ret = pie_alg_unsharp(img.c_red,
                              img.c_green,
                              img.c_blue,
                              &p,
                              img.width,
                              img.height,
                              img.row_stride);
        if (ret)
        {
                abort();
        }
        
        dur = timing_dur_usec(&t);
        printf("Executed unsharp mask took %luusec\n", dur);

        pie_bm_conv_bd(&out, PIE_COLOR_8B,
                       &img, PIE_COLOR_32B);

        pie_io_jpg_u8rgb_write("out.jpg", &out, 95);

        pie_bm_free_f32(&img);
        pie_bm_free_u8(&out);
        
        return 0;
}
