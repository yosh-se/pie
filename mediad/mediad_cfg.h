/*
* Copyright (C) 2017 Fredrik Skogman, skogman - at - gmail.com.
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

#ifndef __MEDIAD_CFG_H__
#define __MEDIAD_CFG_H__

struct mediad_cfg
{
        struct pie_host* host;
        struct pie_stg_mnt_arr* storages;
        struct q_consumer** queues;
};

extern struct mediad_cfg md_cfg;

#endif /* __MEDIAD_CFG_H__ */