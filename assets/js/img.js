var COLLD_PORT = 8081;
var EDITD_PORT = 8080;
var COLLD_HOST = null;
var EDITD_HOST = null;
var PROTO = null;
var histChart;
var lowerPaneHeight = 220;
var histYMax = 255;
var bigEndian = 1;
var devSetScale = 10000.0;
var histDataL = {
    borderColor: "rgba(200, 200, 200, 0.5)",
    backgroundColor: "rgba(200, 200, 200, 0.7)",
    pointRadius: 0,
    lineTension: 0,
    data: [{
        x: 0,
        y: 0
    }]
};
var histDataR = {
    borderColor: "rgba(255, 0, 0, 0.5)",
    backgroundColor: "rgba(255, 0, 0, 0.4)",
    pointRadius: 0,
    lineTension: 0,
    data: [{
        x: 0,
        y: 0
    }]
};
var histDataG = {
    borderColor: "rgba(0, 255, 0, 0.5)",
    backgroundColor: "rgba(0, 255, 0, 0.4)",
    pointRadius: 0,
    lineTension: 0,
    data: [{
        x: 0,
        y: 0
    }]
};
var histDataB = {
    borderColor: "rgba(0, 0, 255, 0.5)",
    backgroundColor: "rgba(0, 0, 255, 0.4)",
    pointRadius: 0,
    lineTension: 0,
    data: [{
        x: 0,
        y: 0
    }]
};
var sliderTimeout = 200;

function getWsUrl(){
    var pcol;
    var u = document.URL;

    /*
     * We open the websocket encrypted if this page came on an
     * https:// url itself, otherwise unencrypted
     */

    if (u.substring(0, 5) == "https") {
	pcol = "wss://";
	u = u.substr(8);
    } else {
	pcol = "ws://";
	if (u.substring(0, 4) == "http")
	    u = u.substr(7);
    }

    u = u.split('/');

    /* + "/xxx" bit is for IE10 workaround */

    return pcol + u[0] + "/xxx";
}

function getParameterByName(name, url) {
    if (!url) {
      url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function wsLoadImage(ws) {
    var img = getParameterByName('img');
    var c = document.getElementById("img_canvas");

    if (!img) {
        return false;
    }

    ws.pieStartTs = Date.now();
    ws.send("LOAD " + img + " " + c.width + " " + c.height);

    return true;
}

function pieInitEdit() {
    var w = window.innerWidth;
    var c = document.getElementById("img_canvas");
    var h;

    w = w - 282 - 50; // edit pane and margin

    if (w < 640) {
        w = 640;
    }
    h = Math.ceil((w / 3) * 2);
    if ((window.outerHeight - h) < lowerPaneHeight) {
        h = window.outerHeight - lowerPaneHeight;
        w = (h * 3) / 2;

        if (w < 640) {
            w = 640;
            h = Math.ceil((w / 3) * 2);
        }
    }

    c.width = w;
    c.height = h;
}

function updateDevParams(params) {
    /*
      sl_colortemp   -30,  30
      sl_tint        -30,  30
      sl_exposure    -50,  50
      sl_contrast   -100, 100
      sl_highlights -100, 100
      sl_shadows    -100, 100
      sl_white      -100, 100
      sl_black      -100, 100
      sl_clarity    -100, 100
      sl_vibrance   -100, 100
      sl_saturation -100, 100
      sl_sharp_a       0, 300
      sl_sharp_r,      1, 100
      sl_sharp_t,      0,  20
     */
    document.getElementById("sl_colortemp").value = params.colort;
    document.getElementById("in_colortemp").value = params.colort;
    document.getElementById("sl_tint").value = params.tint;
    document.getElementById("in_tint").value = params.tint;
    document.getElementById("sl_exposure").value = params.expos;
    document.getElementById("in_exposure").value = params.expos / 10;
    document.getElementById("sl_contrast").value = params.contr;
    document.getElementById("in_contrast").value = params.contr;
    document.getElementById("sl_highlights").value = params.highl;
    document.getElementById("in_highlights").value = params.highl;
    document.getElementById("sl_shadows").value = params.shado;
    document.getElementById("in_shadows").value = params.shado;
    document.getElementById("sl_white").value = params.white;
    document.getElementById("in_white").value = params.white;
    document.getElementById("sl_black").value = params.black;
    document.getElementById("in_black").value = params.black;
    document.getElementById("sl_clarity").value = params.clarity.amount;
    document.getElementById("in_clarity").value = params.clarity.amount;
    document.getElementById("sl_vibrance").value = params.vibra;
    document.getElementById("in_vibrance").value = params.vibra;
    document.getElementById("sl_saturation").value = params.satur;
    document.getElementById("in_saturation").value = params.satur;
    document.getElementById("sl_sharp_a").value = params.sharp.amount;
    document.getElementById("in_sharp_a").value = params.sharp.amount;
    document.getElementById("sl_sharp_r").value = params.sharp.rad;
    document.getElementById("in_sharp_r").value = params.sharp.rad / 10;
    document.getElementById("sl_sharp_t").value = params.sharp.thresh;
    document.getElementById("in_sharp_t").value = params.sharp.thresh;
}

window.onresize = function(evt) {
    var w = window.innerWidth;
    var c = document.getElementById("img_canvas");
    var h;

    w = w - 282 - 50; // edit pane and margin

    if (w < 640) {
        w = 640;
    }
    h = Math.ceil((w / 3) * 2);
    if ((window.outerHeight - h) < lowerPaneHeight) {
        return;
    }
    c.width = w;
    c.height = h;
}

window.addEventListener("load", function(evt) {
    var wsCmd;
    var wsHist;
    var wsImg;
    /* Sync in a hackish way */
    var wsSync = 3;

    pieInitEdit();

    /* Determine endianess */
    var b = new ArrayBuffer(4);
    var a = new Uint32Array(b);
    var c = new Uint8Array(b);
    a[0] = 0xcafebabe;
    if (c[0] == 0xbe) {
        bigEndian = 0;
    }

    wsCmd = new WebSocket(getWsUrl(), "pie-cmd");
    wsCmd.binaryType = "arraybuffer";
    wsHist = new WebSocket(getWsUrl(), "pie-hist");
    wsHist.binaryType = "arraybuffer";
    wsImg = new WebSocket(getWsUrl(), "pie-img");
    wsImg.binaryType = "arraybuffer";

    wsCmd.onopen = function(evt) {
        console.log("Opening command websocket..." + wsSync);
        wsSync = wsSync - 1;

        if (wsSync == 0) {
            wsLoadImage(wsCmd);
        }
    }

    wsHist.onopen = function(evt) {
        console.log("Opening metadata websocket..." + wsSync);
        wsSync = wsSync - 1;

        if (wsSync == 0) {
            wsLoadImage(wsCmd);
        }
    }

    wsImg.onopen = function(evt) {
        console.log("Opening image websocket..." + wsSync);
        wsSync = wsSync - 1;

        if (wsSync == 0) {
            wsLoadImage(wsCmd);
        }
    }

    wsCmd.onclose = function(evt) {
        console.log("Closing websocket...");
        ws = null;
    }

    wsCmd.onerror = function(evt) {
        console.log("ERROR: " + evt.data);
    }

    wsCmd.onmessage = function(evt) {
        console.log("ERROR: " + evt);
    }

    wsImg.onmessage = function(evt) {
        var now = Date.now()
        var dur = now - wsCmd.pieStartTs;

        if (typeof evt.data === "string") {
            conslog.log("ERROR: Got data: " + evt.data);
        } else {
            var le = true;
            var w;
            var h;
            var t;
            var server_dur;
            var tx;

            /* Data arrives as :
               0:3 duration in milli seconds
               4:7 type of message
               8:11 width (uint32, network order)
               12:15 height (uint32, network order)
               16:  rgba */

            /* width and height are in network order */
            server_dur = new DataView(evt.data, 0, 4).getUint32(0, false);
            t = new DataView(evt.data, 4, 4).getUint32(0, false);
            w = new DataView(evt.data, 8, 4).getUint32(0, false);
            h = new DataView(evt.data, 12, 4).getUint32(0, false);

            /* Keep start point to measure draw time */
            wsCmd.pieStartTs = now;

            console.log("Server duration: " + server_dur + "ms");
            console.log("RT in " + dur + "ms");
            tx = dur - server_dur;
            var mbs = evt.data.byteLength / (1024.0 * 1024.0);
            console.log("Estimaged tx: " + tx + "ms for " + mbs + "MiB");
            mbs = mbs * 1000.0 / tx;
            console.log("Estimaged bw " + mbs + "MiB/s");

            var pixels = new Uint8ClampedArray(evt.data, 16);
            var bm = new ImageData(pixels, w, h);

            console.log("Type: " + t + " width: " + w + " height:" + h);

            /* Update canvas */
            var c = document.getElementById("img_canvas");
            var x = (c.width - w) / 2;
            var y = (c.height - h) / 2;
            var ctx = c.getContext("2d");
            ctx.putImageData(bm, x, y);
            now = Date.now();
            dur = now - wsCmd.pieStartTs;
            wsCmd.pieStartTs = now;
            console.log("Draw image in " + dur + "ms");
        }
    }

    wsHist.onmessage = function(evt) {
        var h = JSON.parse(evt.data);
        var max = 0;
        var pl = [];
        var pr = [];
        var pg = [];
        var pb = [];
        var i = 0;

        for (c of h.l) {
            if (c > max) {
                max = c;
            }
        }
        for (c of h.r) {
            if (c > max) {
                max = c;
            }
        }
        for (c of h.g) {
            if (c > max) {
                max = c;
            }
        }
        for (c of h.b) {
            if (c > max) {
                max = c;
            }
        }
        for (i = 0; i < h.l.length; i++) {
            var nl = (h.l[i] / max) * histYMax;
            var nr = (h.r[i] / max) * histYMax;
            var ng = (h.g[i] / max) * histYMax;
            var nb = (h.b[i] / max) * histYMax;

            pl[i] = {
                x: i,
                y: nl
            };
            pr[i] = {
                x: i,
                y: nr
            };
            pg[i] = {
                x: i,
                y: ng
            };
            pb[i] = {
                x: i,
                y: nb
            };
        }

        histDataL.data = pl;
        histDataR.data = pr;
        histDataG.data = pg;
        histDataB.data = pb;
        histChart.update();
    }

    /*
     * I N P U T   S L I D E R S
     */
    document.getElementById("sl_colortemp").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_colortemp").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("COLORT " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_tint").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_tint").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("TINT " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_exposure").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_exposure").value=targ.value / 10.0;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("EXPOS " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_contrast").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_contrast").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("CONTR " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_highlights").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_highlights").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("HIGHL " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_shadows").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_shadows").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("SHADO " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_white").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_white").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("WHITE " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_black").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_black").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("BLACK " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_clarity").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_clarity").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("CLARI " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_vibrance").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_vibrance").value = targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("VIBRA " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_saturation").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_saturation").value = targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("SATUR " + targ.value);
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_sharp_a").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_sharp_a").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            var a = document.getElementById("sl_sharp_a").value;
            var r = document.getElementById("sl_sharp_r").value;
            var t = document.getElementById("sl_sharp_t").value;
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_sharp_r").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_sharp_r").value=targ.value / 10.0;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            var a = document.getElementById("sl_sharp_a").value;
            var r = document.getElementById("sl_sharp_r").value;
            var t = document.getElementById("sl_sharp_t").value;
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
        }, sliderTimeout);

        return true;
    };

    document.getElementById("sl_sharp_t").oninput = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        document.getElementById("in_sharp_t").value=targ.value;

        if (targ.wsCall) {
            clearTimeout(targ.wsCall);
        }
        targ.wsCall = setTimeout(function(){
            var a = document.getElementById("sl_sharp_a").value;
            var r = document.getElementById("sl_sharp_r").value;
            var t = document.getElementById("sl_sharp_t").value;
            wsCmd.pieStartTs = Date.now();
            wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
        }, sliderTimeout);

        return true;
    };

    /*
     * I N P U T   V A L I D A T O R S
     */
    document.getElementById("in_colortemp").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_tint").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_exposure").onkeydown = function(evt) {
        /* Only allow 0-9 - */
        /* ASCII 0-9 is 48 to 57 */
        /* - 189 or 173*/
        /* . 190 */
        /* arrows left right 37 39 */
        /* backspace (8) delete (46) and enter (13)*/
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_contrast").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_highlights").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_shadows").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_white").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_black").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_clarity").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_vibrance").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_saturation").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_sharp_a").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_sharp_r").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    document.getElementById("in_sharp_t").onkeydown = function(evt) {
        var valid = [8, 13, 37, 39, 46, 173, 189, 190];

        if (valid.indexOf(evt.keyCode) !== -1) {
            return;
        }

        if (evt.keyCode > 47 && evt.keyCode < 58) {
            return;
        }

        evt.preventDefault();
    };

    /*
     * M A P   I N P U T   T O   S L I D E R S
     */
    document.getElementById("in_colortemp").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 30) {
            targ.value = 30;
        } else if (targ.value < -30) {
            targ.value = -30;
        }

        document.getElementById("sl_colortemp").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("COLORT " + targ.value);
    };

    document.getElementById("in_tint").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 30) {
            targ.value = 30;
        } else if (targ.value < -30) {
            targ.value = -30;
        }

        document.getElementById("sl_tint").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("TINT " + targ.value);
    };

    document.getElementById("in_exposure").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 5) {
            targ.value = 5;
        } else if (targ.value < -5) {
            targ.value = -5;
        }

        document.getElementById("sl_exposure").value=targ.value * 10;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("EXPOS " + Math.ceil(targ.value * 10));
    };

    document.getElementById("in_contrast").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_contrast").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("CONTR " + targ.value);
    };

    document.getElementById("in_highlights").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_highlights").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("HIGHL " + targ.value);
    };

    document.getElementById("in_shadows").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_shadows").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("SHADO " + targ.value);
    };

    document.getElementById("in_white").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_white").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("WHITE " + targ.value);
    };

    document.getElementById("in_black").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_black").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("BLACK " + targ.value);
    };

    document.getElementById("in_clarity").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_clarity").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("CLARI " + targ.value);
    };

    document.getElementById("in_vibrance").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_vibrance").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("VIBRA " + targ.value);
    };

    document.getElementById("in_saturation").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 100) {
            targ.value = 100;
        } else if (targ.value < -100) {
            targ.value = -100;
        }

        document.getElementById("sl_saturation").value=targ.value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("SATUR " + targ.value);
    };

    document.getElementById("in_sharp_a").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 300) {
            targ.value = 300;
        } else if (targ.value < 0) {
            targ.value = -0;
        }

        document.getElementById("sl_sharp_a").value=targ.value;
        var a = document.getElementById("sl_sharp_a").value;
        var r = document.getElementById("sl_sharp_r").value;
        var t = document.getElementById("sl_sharp_t").value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
    };

    document.getElementById("in_sharp_r").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 10) {
            targ.value = 10;
        } else if (targ.value < 0.1) {
            targ.value = 0.1;
        }

        document.getElementById("sl_sharp_r").value=targ.value * 10;
        var a = document.getElementById("sl_sharp_a").value;
        var r = document.getElementById("sl_sharp_r").value;
        var t = document.getElementById("sl_sharp_t").value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
    };

    document.getElementById("in_sharp_t").onchange = function(evt) {
        var targ;

        if (!wsCmd) {
            return false;
        }

        if (evt.target) {
            targ = evt.target;
        } else {
            targ = evt.srcElement;
        }

        if (isNaN(targ.value)) {
            targ.value = 0;
        } else if (targ.value > 20) {
            targ.value = 20;
        } else if (targ.value < 0) {
            targ.value = 0;
        }

        document.getElementById("sl_sharp_t").value=targ.value;
        var a = document.getElementById("sl_sharp_a").value;
        var r = document.getElementById("sl_sharp_r").value;
        var t = document.getElementById("sl_sharp_t").value;
        wsCmd.pieStartTs = Date.now();
        wsCmd.send("SHARP " + a + " " + r + " " + t + " ");
    };

    var histCanvas = document.getElementById("hist_canvas").getContext("2d");
    histChart = new Chart(histCanvas, {
        type: 'line',
        data: {
            datasets: [
                histDataL,
                histDataR,
                histDataG,
                histDataB
            ]
        },
        options: {
            legend: {
                display: false
            },
            responsive: false,
            scales: {
                xAxes: [{
                    type: 'linear',
                    position: 'bottom',
                    display: false,
                    ticks: {
                        min: 0,
                        max: 255
                    }
                }],
                yAxes: [{
                    type: 'linear',
                    display: false,
                    ticks: {
                        min: 0,
                        max: histYMax
                    }
                }]
            }
        }
    });

    // Configure hosts
    var url = window.location.href.split("/");
    PROTO = url[0];
    if (COLLD_HOST == null) {
        COLLD_HOST = url[2].split(":")[0];
    }
    if (EDITD_HOST == null) {
        EDITD_HOST = url[2].split(":")[0];
    }

    // Load development settings
    var devpClient = new XMLHttpRequest();
    var img = getParameterByName('img');
    devpClient.onreadystatechange = function() {
        if (devpClient.readyState == XMLHttpRequest.DONE) {
            if (devpClient.status == 200) {
                var settings = JSON.parse(devpClient.responseText);

                // Settings are scaled with devSetScale
                settings.colort = Math.round(settings.colort / devSetScale);
                settings.tint = Math.round(settings.tint / devSetScale);
                settings.expos = Math.round(settings.expos / devSetScale);
                settings.contr = Math.round(settings.contr / devSetScale);
                settings.highl = Math.round(settings.highl / devSetScale);
                settings.shado = Math.round(settings.shado / devSetScale);
                settings.white = Math.round(settings.white / devSetScale);
                settings.black = Math.round(settings.black / devSetScale);
                settings.clarity.amount = Math.round(settings.clarity.amount / devSetScale);
                settings.clarity.rad    = Math.round(settings.clarity.rad    / devSetScale);
                settings.clarity.thresh = Math.round(settings.clarity.thresh / devSetScale);
                settings.vibra = Math.round(settings.vibra / devSetScale);
                settings.satur = Math.round(settings.satur / devSetScale);
                settings.rot = Math.round(settings.rot / devSetScale);
                settings.sharp.amount = Math.round(settings.sharp.amount / devSetScale);
                settings.sharp.rad    = Math.round(settings.sharp.rad    / devSetScale);
                settings.sharp.thresh = Math.round(settings.sharp.thresh / devSetScale);

                updateDevParams(settings);
            }
        }
    };

    var devpUrl = PROTO + "//" + COLLD_HOST + ":" + COLLD_PORT;
    devpUrl += "/devparams/" + img;
    console.log(devpUrl);
    devpClient.open("GET", devpUrl, true);
    devpClient.send();
});


document.onkeydown = function(evt) {
    evt = evt || window.event;

    console.log("Captured key code: " + evt.keyCode);
    switch (evt.keyCode) {
    case 27:
        console.log("esc");
        alert("escape clicked yo!");
        break;
        /* nav */
    case 37:
    case 38:
    case 39:
    case 40:
        console.log("navigate yo");
        break;
        /* rating */
    case 48:
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
        console.log("rate yo");
        break;
        /* color */
    case 54:
    case 55:
    case 56:
    case 57:
        console.log("color yo");
        break;
    case 71: /* g */
        var col = getParameterByName('col');
        var newUrl = PROTO + "//" + COLLD_HOST + ":" + COLLD_PORT + "/";

        if (col != null && col != "") {
            newUrl += "?col=" + col;
        }
        window.location.replace(newUrl);
        break;
    case 90:
        console.log("zoom");
        break;
    }

};
