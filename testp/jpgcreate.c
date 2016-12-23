#include <stdio.h>
#include <stdlib.h>
#include "../pie_types.h"
#include "../pie_bm.h"
#include "../io/pie_io_jpg.h"
    
/* Given "value" and "max", the maximum value which we expect "value"
   to take, this returns an integer between 0 and 255 proportional to
   "value" divided by "max". */

static int pix(int value, int max)
{
        if (value < 0)
        {
                return 0;            
        }

        return (int) (256.0 *((double) (value)/(double) max));
}

int main ()
{
        struct bitmap_u8rgb out;
        int ret;

        /* Create an image. */

        out.width = 120;
        out.height = 120;
        out.color_type = PIE_COLOR_TYPE_RGB;

        bm_alloc_u8(&out);

        for (int y = 0; y < out.height; y++)
        {
                for (int x = 0; x < out.width; x++)
                {
                        struct pixel_u8rgb pixel;

                        pixel.red = pix(x, out.width);
                        pixel.green = pix(y, out.height);
                        pixel.blue = 0;

                        pixel_u8rgb_set(&out, x, y, &pixel);
                }
        }

        /* Write the image to a file 'out.png'. */
        ret = jpg_u8rgb_write("out.jpg", &out, 90);
        if (ret)
        {
                printf("Failed: %d\n", ret);
        }
        bm_free_u8(&out);

        return 0;
}
