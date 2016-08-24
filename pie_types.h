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

#ifndef __PIE_TYPES_H__
#define __PIE_TYPES_H__

#include <stdint.h>

enum pie_color_type {
        PIE_COLOR_TYPE_GRAY,
        PIE_COLOR_TYPE_RGB
};

struct pixel_8rgb
{
        uint8_t red;
        uint8_t green;
        uint8_t blue;
};

struct pixel_f32rgb
{
        float red;
        float green;
        float blue;
};

struct bitmap_8rgb
{
        struct pixel_8rgb *pixels;
        enum pie_color_type color_type;
        int width;
        int height;
};

struct bitmap_f32rgb
{
        struct pixel_f32rgb *pixels;
        enum pie_color_type color_type;
        int width;
        int height;
};

#endif /* __PIE_TYPES_H__ */
