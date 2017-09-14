var mobCache = {};
var exifCache = {};
var selectedMobId = "";
var selectedCollection = {};
var NAV_LEFT = 37;
var NAV_UP = 38;
var NAV_RIGHT = 39;
var NAV_DOWN = 40;
var histChart;
var histYMax = 255;
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

function rateFilenameFromMob(mob) {
    var filename = "img/rate_0.png";

    switch(mob.rating) {
    case 1:
        filename = "img/rate_1.png";
        break;
    case 2:
        filename = "img/rate_2.png";
        break;
    case 3:
        filename = "img/rate_3.png";
        break;
    case 4:
        filename = "img/rate_4.png";
        break;
    case 5:
        filename = "img/rate_5.png";
        break;
    }

    return filename;
}

function loadCollection(collectionId) {
    var xmlhttp = new XMLHttpRequest();
    var w = window.innerWidth;
    var h = window.innerHeight;
    // pane: 232px
    // margin 10px r, 10px l
    // thumb size is 212px
    // min number of columns is 3
    // border spacing is 3
    // scroll window is 15px
    // footer is 150px
    // header is 40px
    var columns = 3;
    var img_x = w - 15 - 2 * 238;
    var thumb_size = 212;

    columns = Math.floor(img_x / (thumb_size + 28));

    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE ) {
           if (xmlhttp.status == 200) {
               var coll = JSON.parse(xmlhttp.responseText);
               var innerHtml = "";
               var newRow = "<tr>";
               var div = "<div class=\"grid-view-table-cell\">";
               var count = 1;
               var closed = false;

               innerHtml += newRow
               for (i of coll.assets) {
                   var cellId = "grid-cell-mob-" + i.id;
                   mobCache[i.id] = i.mob;
                   var newCell = "<td id=\"" + cellId +"\"class=\"grid-view-table-td\" onclick=\"selectMob('" + i.id + "',this);\">";

                   innerHtml += newCell;
                   innerHtml += div;

                   switch(i.mob.orientation) {
                   case 3: /* image is rotated 180 cw */
                       innerHtml += "<img class=\"rotate180\" width=\"" + thumb_size + "\" src=\"thumb/" + i.id + ".jpg\">";
                       break;
                   case 6:/* image is rotated 270 cw */
                       innerHtml += "<img class=\"rotate90\" width=\"" + thumb_size + "\" src=\"thumb/" + i.id + ".jpg\">";
                       break;
                   case 8: /* image is rotated 90 cw */
                       innerHtml += "<img class=\"rotate270\" width=\"" + thumb_size + "\" src=\"thumb/" + i.id + ".jpg\">";
                       break;
                   default:
                       innerHtml += "<img width=\"" + thumb_size + "\" src=\"thumb/" + i.id + ".jpg\">";
                   }

                   var rating = rateFilenameFromMob(i.mob);
                   innerHtml += "</div>";
                   innerHtml += "<div class=\"grid-view-table-footer\">";
                   innerHtml += "<img width=\"80\" src=\"" + rating +"\"></div>";
                   innerHtml += "</td>";
                   closed = false;

                   if (count % columns == 0) {
                       innerHtml += "</tr>";
                       innerHtml += newRow;
                       closed = true;
                   }
                   count++;
               }

               if (!closed) {
                   innerHtml += "</tr>";
               }

               var collTable = document.getElementById("coll-grid-table");
               collTable.innerHTML = innerHtml;

               /* Save selected collection last after any sorting has been
                  applied */
               selectedCollection = coll;
           }
           else if (xmlhttp.status == 400) {
               console.log("There was an error 400");
           }
           else {
               console.log("something else other than 200 was returned");
           }
        }
    };

    xmlhttp.open("GET", "collection/" + collectionId, true);
    xmlhttp.send();
}

function selectMob(id, cell) {
    // Clear selected item
    var collTable = document.getElementById("coll-grid-table");

    for (row of collTable.rows) {
        for (column of row.cells) {
            column.className = "grid-view-table-td";
        }
    }
    // Mark new element
    cell.className += " grid-view-table-td-active";

    // Get the img element
    var imgElem = cell.childNodes[0].childNodes[0];

    calculateHistogram(imgElem);
    loadExif(id);
    selectedMobId = id;
}

function navigateMob(direction) {
    if (!selectedMobId || selectedMobId == "") {
        console.log("No mob selected");
        return;
    }

    if (!("assets" in selectedCollection)) {
        return;
    }

    var currMob = -1;
    for (i = 0; i < selectedCollection.assets.length; i++) {
        if (selectedMobId == selectedCollection.assets[i].id) {
            currMob = i;
            break;
        }
    }

    if (currMob < 0) {
        /* selected mob not fount */
        console.log("navigateMob: selected mob not found");
        return;
    }

    var newMob = currMob;
    var collTable = document.getElementById("coll-grid-table");
    var numCols = collTable.rows[0].cells.length;

    switch(direction) {
    case NAV_LEFT:
        newMob -= 1;
        break;
    case NAV_UP:
        newMob -= numCols;
        break;
    case NAV_RIGHT:
        newMob += 1;
        break;
    case NAV_DOWN:
        newMob += numCols;
        break;
    }

    newMob = Math.min(selectedCollection.assets.length - 1, newMob);
    newMob = Math.max(0, newMob);
    var mobId = selectedCollection.assets[newMob].id;

    if (currMob == newMob) {
        return;
    }

    /* Get the new cell to and select it */
    var y = 0;
    while (newMob >= numCols) {
        y++;
        newMob -= numCols;
    }

    var newCell = collTable.rows[y].cells[newMob];
    selectMob(mobId, newCell);
    updateSingleView(mobId);
}

function loadExif(id) {
    if (id in exifCache) {
        renderExif(exifCache[id]);
        return;
    }

    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (xmlhttp.status == 200) {
                var exif = JSON.parse(xmlhttp.responseText);

                exifCache[exif.id] = exif;
                renderExif(exif);
            }
        }
    };

    xmlhttp.open("GET", "exif/" + id, true);
    xmlhttp.send();
}

function mobColorString(color) {
    switch (color) {
    case 1:
        return "Red";
    case 2:
        return "Green";
    case 3:
        return "Blue";
    case 4:
        return "Yellow";
    case 5:
        return "Black";
    }

    return "";
}

function renderExif(exif) {
    var table = document.getElementById("meta_data_tbl_top");
    var mob = mobCache[exif.id];

    table.rows[0].cells[0].innerHTML = "ISO " + exif.iso;
    table.rows[0].cells[1].innerHTML = exif.focal_len + " mm";
    table.rows[0].cells[2].innerHTML = "f/" + (exif.fnumber / 10);
    table.rows[0].cells[3].innerHTML = exif.exposure_time + " sec";

    table = document.getElementById("meta_data_tbl_1");
    table.rows[0].cells[1].innerHTML = mob.name;
    table.rows[1].cells[1].innerHTML = "collection";

    table = document.getElementById("meta_data_tbl_2");
    table.rows[0].cells[1].innerHTML = exif.copyright;
    table.rows[1].cells[1].innerHTML = exif.artist;

    table = document.getElementById("meta_data_tbl_3");
    table.rows[0].cells[1].innerHTML = mob.rating + "/5";
    table.rows[1].cells[1].innerHTML = mobColorString(mob.color);

    table = document.getElementById("meta_data_tbl_4");
    table.rows[0].cells[1].innerHTML = exif.date;

    table = document.getElementById("meta_data_tbl_5");
    table.rows[0].cells[1].innerHTML = exif.x + " x " + exif.y;
    table.rows[1].cells[1].innerHTML = exif.exposure_time + " sec at f/" + (exif.fnumber / 10);
    table.rows[2].cells[1].innerHTML = exif.focal_len + " mm";
    table.rows[3].cells[1].innerHTML = exif.iso;
    if (exif.flash & 0x1) {
        table.rows[4].cells[1].innerHTML = "Fired";
    } else {
        table.rows[4].cells[1].innerHTML = "Did not fire";
    }
    table.rows[5].cells[1].innerHTML = exif.make;
    table.rows[6].cells[1].innerHTML = exif.model;
    table.rows[7].cells[1].innerHTML = exif.lens;
}

function viewSingleMob(mobId) {
    var modal = document.getElementById("view-modal");

    if (!mobId || mobId == "") {
        console.log("None selected");
        return;
    }

    /* Enable modal view */
    modal.style.display = "block";
    /* Render image */
    updateSingleView(mobId);
}

function updateSingleView(mobId) {
    var modal = document.getElementById("view-modal");
    if (modal.style.display == "none") {
        return;
    }

    var mob = mobCache[mobId];
    var image = new Image();

    image.onload = function() {
        var canvas = document.getElementById("single-image-view");
        var scale = 1.0;
        var x = this.width;
        var y = this.height;

        /* When calculating scaling, the presented orientation
           must be used. */
        if (mob.orientation == 6 ||
            mob.orientation == 8) {
            var tmp = x;
            x = y;
            y = tmp;
        }

        if (x > canvas.scrollWidth) {
            scale = canvas.scrollWidth / x;
        }

        if (y * scale > (window.innerHeight - 100)) {
            scale = (innerHeight - 100)/ y;
        }

        canvas.width = canvas.scrollWidth;
        canvas.height = Math.ceil(y * scale);
        var newX = Math.ceil(x * scale);
        var ctx = canvas.getContext('2d');
        // This may cause problem with down sampling, if so, perform it in
        // steps to trigger "larger" down sampling matrix.
        var offsetX = (canvas.width - newX) / 2;

        switch (mob.orientation) {
        case 1: /* 0 */
            ctx.transform(scale, 0,
                          0, scale,
                          offsetX, 0);
            break;
        case 3: /* 180 */
            ctx.transform(-scale, 0,
                          0, -scale,
                          offsetX + scale * this.width, scale * this.height);
            break;
        case 6: /* 270 */
            ctx.transform(0, scale,
                          -scale, 0,
                          offsetX + scale * this.height, 0);
            break;
        case 8: /* 90 */
            ctx.transform(0, -scale,
                          scale, 0,
                          offsetX, scale * this.width);
            break;
        }

        ctx.drawImage(this, 0, 0, this.width, this.height);
    };

    image.src = "/proxy/" + mobId + ".jpg";
}

function closeSingleView() {
    var modal = document.getElementById("view-modal");
    modal.style.display = "none";
}

/*
 * Create an offscreen canvas and draw the image. Extract the pixel
 * data and calculate lum, r, g, b histograms.
 */
function calculateHistogram(img) {
    var canvas = document.createElement('canvas');
    var pl = [];
    var pr = [];
    var pg = [];
    var pb = [];
    var histLum = [];
    var histRed = [];
    var histGreen = [];
    var histBlue = [];
    var histSum = 0;
    var imgData = null;
    var pixels = null;
    var max = 0;

    /* Reset histograms */
    for (i = 0; i < 256; i++) {
        histLum[i] = 0;
        histRed[i] = 0;
        histGreen[i] = 0;
        histBlue[i] = 0;
    }

    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
    imgData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    pixels = imgData.data;

    for(i = 0; i < pixels.length; i += 4) {
        var red = pixels[i];
        var green = pixels[i+1];
        var blue = pixels[i+2];
        // Omit alpha

        var lum = red * 0.2126 + green * 0.7152 + blue * 0.0722;

        histLum[Math.floor(lum)] += 1;
        histRed[red] += 1;
        histGreen[green] += 1;
        histBlue[blue] += 1;
    }

    /* Normalize */
    for (c of histLum) {
        histSum += c;
        if (c > max) {
            max = c;
        }
    }
    for (c of histRed) {
        histSum += c;
        if (c > max) {
            max = c;
        }
    }
    for (c of histGreen) {
        histSum += c;
        if (c > max) {
            max = c;
        }
    }
    for (c of histBlue) {
        histSum += c;
        if (c > max) {
            max = c;
        }
    }
    var histMu = histSum / 1024;
    var histLimit = histMu * 13.0;
    if (histLimit < max) {
        max = histLimit;
    }

    for (i = 0; i < histLum.length; i++) {
        var nl = histLum[i] < histLimit ? histLum[i]: histLimit;
        var nr = histRed[i] < histLimit ? histRed[i]: histLimit;
        var ng = histGreen[i] < histLimit ? histGreen[i]: histLimit;
        var nb = histBlue[i] < histLimit ? histBlue[i]: histLimit;

        nl = (nl / histLimit) * histYMax;
        nr = (nr / histLimit) * histYMax;
        ng = (nb / histLimit) * histYMax;
        nb = (ng / histLimit) * histYMax;
        
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

function rateMob(mobId, rate) {
    if (!mobId || mobId == "") {
        console.log("No mob selected");
        return
    }

    var mob = mobCache[mobId];
    var not = document.getElementById("popup-rate-set");

    /* Update and show rating information */
    not.innerHTML = "Set rating to " + rate;
    not.style.display = "block";
    setTimeout(function(){
        not.style.display = "none";
    }, 800);

    mob.rating = rate;
    updateMob(mob);
}

function updateMob(mob) {
    var xmlhttp = new XMLHttpRequest();
    var jsonString = JSON.stringify(mob);

    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (xmlhttp.status == 200) {
                var newMob = JSON.parse(xmlhttp.responseText);
                mobCache[newMob.id] = newMob;

                /* update rating */
                var cellId = "grid-cell-mob-" + newMob.id;
                var cell = document.getElementById(cellId);
                var imgElem = cell.childNodes[1].childNodes[0];
                console.log(imgElem);
                imgElem.src = rateFilenameFromMob(newMob);

                /* Make new data visible */
                loadExif(newMob.id);
            }
        }
    };

    xmlhttp.open("PUT", "mob/" + mob.id, true);
    xmlhttp.setRequestHeader('Content-Type', 'application/json');
    xmlhttp.send(jsonString);
}

window.addEventListener("load", function(evt) {
    var id = getParameterByName("id")
    var xmlhttp = new XMLHttpRequest();

    /* Prepare histogram */
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

    // Fetch all collections and draw them.
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {
            if (xmlhttp.status == 200) {
                var coll_tree = {};
                var coll = JSON.parse(xmlhttp.responseText);

                // Build the tree structure of all collections
                coll.sort(function(a,b) {
                    return a.path.localeCompare(b.path);
                });

                if (coll[0].path != "/") {
                    alert("This is not right");
                }
                coll_tree["path"] = "Collection root";
                coll_tree["id"] = coll[0].id;
                coll_tree["children"] = {};

                for (i of coll) {
                    if (i.path == "/") {
                        continue;
                    }

                    var comps = i.path.split("/");
                    var root = coll_tree;
                    for (c of comps) {
                        if (c.length == 0) {
                            continue;
                        }

                        if (!(c in root.children)) {
                            var child = {
                                "children": {},
                                "path": c,
                            };
                            root["children"][c] = child;
                        }

                        root = root["children"][c];
                    }

                    root["id"] = i.id;
                }

                console.log(coll_tree);
                // Create the HTML for it by doing a depth first
                // traversal.
                var stack = [];
                var innerHtml = "";

                stack.push(coll_tree);
                while (stack.length > 0) {
                    var node = stack.pop();

                    if ("closeLi" in node) {
                        innerHtml += "</li>";
                        continue;
                    }
                    if ("closeUl" in node) {
                        innerHtml += "</ul>";
                        continue;
                    }

                    innerHtml += "<li>";

                    if ("id" in node) {
                        innerHtml += "<a href=\"#\" onclick=\"loadCollection('" + node.id + "');\">" + node.path + "</a>";
                    } else {
                        innerHtml += node.path;
                    }

                    stack.push({
                        "closeLi": true,
                    });

                    var childs = Object.keys(node.children);
                    if (childs.length > 0) {
                        innerHtml += "<ul>";
                        stack.push({
                            "closeUl": true,
                        });
                        for (i = childs.length - 1; i >= 0; i--) {
                            stack.push(node.children[childs[i]]);
                        }
                    }
                }

                var collUl = document.getElementById("coll-list");
                collUl.innerHTML = innerHtml;
                // Initialize the list
                CollapsibleLists.apply();
            } else {
                console.log("Error");
                console.log(xmlhttp);
            }
        }
    };

    xmlhttp.open("GET", "collection/", true);
    xmlhttp.send();

    // Load collection if present
    if (id) {
        console.log("Get collection: " + id);
        loadCollection(id);
   }
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
        navigateMob(evt.keyCode);
        break;
        /* rating */
    case 48:
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
        var rate = evt.keyCode - 48;
        rateMob(selectedMobId, rate);
        break;
    case 68: /* d */
        console.log("Develop view");
        break;
    case 69: /* e */
        viewSingleMob(selectedMobId);
        break;
    case 71: /* g */
        closeSingleView();
        break;
    case 90:
        console.log("zoom");
        break;
    }

};
