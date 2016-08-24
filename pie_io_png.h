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

#ifndef __PIE_IO_PNG_H__
#define __PIE_IO_PNG_H__

#include "pie_types.h"

/**
 * Reads an PNG image into the provided bitmap.
 * If PNG image only has a single channel, the data vill be read
 * into the red channel.
 * @param the bitmap to store image in.
 * @param path to the file on disk.
 * @return 0 on success, error code otherwise.
 */
int png_f32_read(struct bitmap_f32rgb* bm, const char* path);

/**
 * Writes an 8bit RGB bitmap to a PNG file.
 * @param the output filename of the PNG file.
 * @param the bitmap to write.
 * @return 0 on success, non-zero otherwise.
 */
extern int png_8rgb_write(const char*, struct bitmap_8rgb*);

#endif /* __PIE_IO_PNG_H__ */
