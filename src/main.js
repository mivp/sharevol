/** @preserve
 * ShareVol
 * Lightweight WebGL volume viewer/slicer
 *
 * Copyright (c) 2014, Monash University. All rights reserved.
 * Author: Owen Kaluza - owen.kaluza ( at ) monash.edu
 *
 * Licensed under the GNU Lesser General Public License
 * https://www.gnu.org/licenses/lgpl.html
 *
 */
//TODO: colourmaps per slicer/volume not shared (global shared list of selectable maps?)
var volume;
var slicer;
var colours;
//Windows...
var info, colourmaps;
var state = {};
var reset;
var filename;
var mobile;
var socket = io();
var jsonfile;

// for save as
var hSave = null;
var tag = null;
var presetList = ['default'];
var currPreset = 'default';
var guiObj = {
  saveItem: 'default'
};

function initPage() {
  window.onresize = autoResize;

  //Create tool windows
  info = new Popup("info");
  info.show();
  colourmaps = new Popup("colourmap", 400, 200);

  try {
    if (!window.WebGLRenderingContext)
      throw "No browser WebGL support";
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!ctx)
      throw "No WebGL context available";
    canvas = ctx = null;
  } catch (e) {
    $('status').innerHTML = "Sorry, ShareVol requires a <a href='http://get.webgl.org'>WebGL</a> capable browser!";
    return;
  }

  //Yes it's user agent sniffing, but we need to attempt to detect mobile devices so we don't over-stress their gpu...
  mobile = (screen.width <= 760 || /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent));

  //Colour editing and palette management
  colours = new GradientEditor($('palette'), updateColourmap);

  //Load json data?
  var json = getSearchVariable("data");
  //Attempt to load default.json
  if (!json) json = "default.json";
  
  // parse tag and preset
  let parts = json.split('/');
  tag = parts[2];
  let preset = parts[4];
  parts = preset.split('&');
  preset = parts[0];
  parts = preset.split('.');
  preset = parts[0];
  preset = preset.substr(8);
  if(preset === '') preset = 'default';
  currPreset = preset;
  console.log('tag and preset: ', tag, currPreset);

  $('status').innerHTML = "Loading params...";
  ajaxReadFile(decodeURI(json), loadData, true);
  
  jsonfile = json;
}

function loadStoredData(key) {
  if (localStorage[key]) {
    try {
      var parsed = JSON.parse(localStorage[key]);
      state = parsed;
    } catch (e) {
      //if erroneous data in local storage, delete
      //console.log("parse error: " + e.message);
      alert("parse error: " + e.message);
      localStorage[key] = null;
    }
  }
}

function loadData(src, fn) {
  var parsed = JSON.parse(src);
  if (parsed.volume) {
    //Old data format
    state = {}
    state.properties = {};
    state.colourmaps = [{}];
    object = {};
    view = {};
    state.views = [view];
    state.objects = [object];
    //Copy fields to their new locations
    //Objects
    object.name = "volume";
    object.samples = parsed.volume.properties.samples;
    object.isovalue = parsed.volume.properties.isovalue;
    object.isowalls = parsed.volume.properties.drawWalls;
    object.isoalpha = parsed.volume.properties.isoalpha;
    object.isosmooth = parsed.volume.properties.isosmooth;
    object.colour = parsed.volume.properties.isocolour;
    object.density = parsed.volume.properties.density;
    object.mindensity = parsed.volume.properties.mindensity;
    object.maxdensity = parsed.volume.properties.maxdensity;
    object.power = parsed.volume.properties.power;
    if (parsed.volume.properties.usecolourmap) object.colourmap = 0;
    object.tricubicfilter = parsed.volume.properties.tricubicFilter;
    object.zmin = parsed.volume.properties.Zmin;
    object.zmax = parsed.volume.properties.Zmax;
    object.ymin = parsed.volume.properties.Ymin;
    object.ymax = parsed.volume.properties.Ymax;
    object.xmin = parsed.volume.properties.Xmin;
    object.xmax = parsed.volume.properties.Xmax;
    object.brightness = parsed.volume.properties.brightness;
    object.contrast = parsed.volume.properties.contrast;
    //The volume data sub-object
    object.volume = {};
    object.volume.url = parsed.url;
    object.volume.res = parsed.res;
    object.volume.scale = parsed.scale;
    //The slicer properties
    object.slices = parsed.slicer;
    //Properties - global rendering properties
    state.properties.nogui = parsed.nogui;
    //Views - single only in old data
    view.axes = parsed.volume.properties.axes;
    view.border = parsed.volume.properties.border;
    view.translate = parsed.volume.translate;
    view.rotate = parsed.volume.rotate;
    view.focus = parsed.volume.focus;

    //Colourmap
    colours.read(parsed.volume.colourmap);
    colours.update();
    state.colourmaps = [colours.palette.get()];
    delete state.colourmaps[0].background;
    state.properties.background = colours.palette.background.html();
  } else {
    //New format - LavaVu compatible
    state = parsed;
  }

  reset = state; //Store orig for reset
  //Storage reset?
  if (getSearchVariable("reset")) {localStorage.removeItem(fn); console.log("Storage cleared");}
  /* LOCALSTORAGE DISABLED
  //Load any stored presets for this file
  filename = fn;
  loadStoredData(fn);
  */

  //Setup default props from original data...
  //state.objects = reset.objects;
  if (!state.objects[0].volume.res) state.objects[0].volume.res = [256, 256, 256];
  if (!state.objects[0].volume.scale) state.objects[0].volume.scale = [1.0, 1.0, 1.0];

  //Load the image
  loadTexture();
}

function saveData() {
  try {
    localStorage[filename] = getData();
  } catch(e) {
    //data wasn’t successfully saved due to quota exceed so throw an error
    console.log('LocalStorage Error: Quota exceeded? ' + e);
  }
}

function getData(compact, matrix) {
  if (volume) {
    var vdat = volume.get(matrix);
    var object = state.objects[0];
    object.saturation = vdat.properties.saturation;
    object.brightness = vdat.properties.brightness;
    object.contrast = vdat.properties.contrast;
    object.zmin = vdat.properties.zmin;
    object.zmax = vdat.properties.zmax;
    object.ymin = vdat.properties.ymin;
    object.ymax = vdat.properties.ymax;
    object.xmin = vdat.properties.xmin;
    object.xmax = vdat.properties.xmax;
    //object.volume.res = parsed.res;
    //object.volume.scale = parsed.scale;
    object.samples = vdat.properties.samples;
    object.isovalue = vdat.properties.isovalue;
    object.isowalls = vdat.properties.isowalls
    object.isoalpha = vdat.properties.isoalpha;
    object.isosmooth = vdat.properties.isosmooth;
    object.colour = vdat.properties.colour;
    object.density = vdat.properties.density;
    object.mindensity = vdat.properties.mindensity;
    object.maxdensity = vdat.properties.maxdensity;
    object.power = vdat.properties.power;
    object.tricubicfilter = vdat.properties.tricubicFilter;
    if (vdat.properties.usecolourmap)
      object.colourmap = 0;
    else
      delete object.colourmap;

    //Views - single only in old data
    state.views[0].axes = vdat.properties.axes;
    state.views[0].border = vdat.properties.border;
    state.views[0].translate = vdat.translate;
    state.views[0].rotate = vdat.rotate;

    if (slicer)
       state.objects[0].slices = slicer.get();

    //Colourmap
    state.colourmaps = [colours.palette.get()];
    state.colourmaps[0].name = "default";
    delete state.colourmaps[0].background;
    state.properties.background = colours.palette.background.html();
  }

  //Return compact json string
  console.log(JSON.stringify(state, null, 2));
  if (compact) return JSON.stringify(state);
  //Otherwise return indented json string
  return JSON.stringify(state, null, 2);
}

function saveDataJson() {
  socket.emit('savedatajson', { file: jsonfile, json: getData() });
}

function saveDataJsonAs() {
  let d = new Date();
  let tstr = d.getYear() + '' + d.getMonth() + '' + d.getDay() + '-' + d.getHours() + '' + d.getMinutes();
  var preset = prompt("Save current settings as", tstr);
  console.log(preset);
  if (preset === null) return;
  if (preset === '') {
      $('status').innerHTML = "Cannot save empty preset!";
      info.show();
      setTimeout(hideMessage, 3000);
      return;
  }
  preset = preset.replace(/ /g,"_");
  let file = 'data/tags/' + tag + '/volume_result/vol_web_' + preset + '.json';
  console.log(file);
  socket.emit('savedatajson', { file: file, json: getData() });
}

socket.on('savedatajson', function (data) {
  if(data.status === "error") {
    //alert("Error: " + data.detail + " ()");
    $('status').innerHTML = "Fail to save. You cannot save examples!";
    info.show();
    setTimeout(hideMessage, 3000);
  }
  else if(data.status == "done") {
    // update presets
    socket.emit('getsavelist', { type: 'volume', tag:  tag});
    
    //alert("Saved succesfully!");
    $('status').innerHTML = "Saved successfully!";
    info.show();
    setTimeout(hideMessage, 2000);
  }
});

function updateDatDropdown(target, list){   
    let innerHTMLStr = "";
    if(list.constructor.name == 'Array'){
        for(var i=0; i<list.length; i++){
            var str = "<option value='" + list[i] + "'>" + list[i] + "</option>";
            innerHTMLStr += str;        
        }
    }

    if(list.constructor.name == 'Object'){
        for(var key in list){
            var str = "<option value='" + list[key] + "'>" + key + "</option>";
            innerHTMLStr += str;
        }
    }
    if (innerHTMLStr != "") target.domElement.children[0].innerHTML = innerHTMLStr;
}

socket.on('getsavelist', function(data) {
  if(data.status === 'error') {
    $('status').innerHTML = "Failed to get save list!";
    info.show();
    setTimeout(hideMessage, 3000);
  }
  else if(data.status == "done") {
    presetList = data.result;
    console.log('getsavelist', presetList);
    updateDatDropdown(hSave, presetList);
    guiObj.saveItem = currPreset;
  }
})

function hideMessage() {
  info.hide();
}

function exportData() {
  window.open('data:text/json;base64,' + window.btoa(getData()));
}

function resetFromData(src) {
  //Restore data from saved props
  if (src.objects[0].volume && volume) {
    volume.load(src.objects[0]);
    volume.draw();
  }

  if (src.objects[0].slices && slicer) {
    slicer.load(src.objects[0].slices);
    slicer.draw();
  }
}

function loadTexture() {
  $('status').innerHTML = "Loading image data... ";
  var image;

  loadImage(state.objects[0].volume.url, function () {
    image = new Image();

    var headers = request.getAllResponseHeaders();
    var match = headers.match( /^Content-Type\:\s*(.*?)$/mi );
    var mimeType = match[1] || 'image/png';
    var blob = new Blob([request.response], {type: mimeType} );
    image.src =  window.URL.createObjectURL(blob);
    var imageElement = document.createElement("img");

    image.onload = function () {
      console.log("Loaded image: " + image.width + " x " + image.height);
      imageLoaded(image);
    }
  }
  );
}

function imageLoaded(image) {
  //Create the slicer
  if (state.objects[0].slices) {
    if (mobile) state.objects[0].slices.show = false; //Start hidden on small screen
    slicer = new Slicer(state.objects[0], image, "linear");
  }

  //Create the volume viewer
  if (state.objects[0].volume) {
    interactive = true;
    if (mobile || state.properties.interactive == false) interactive = false;
    volume = new Volume(state.objects[0], image, interactive);
    volume.slicer = slicer; //For axis position
  }

  //Volume draw on mouseup to apply changes from other controls (including slicer)
  document.addEventListener("mouseup", function(ev) {if (volume) volume.delayedRender(250, true);}, false);
  document.addEventListener("wheel", function(ev) {if (volume) volume.delayedRender(250, true);}, false);

  //Update colours (and draw objects)
  colours.read(state.colourmaps[0].colours);
  //Copy the global background colour
  colours.palette.background = new Colour(state.properties.background);
  colours.update();

  info.hide();  //Status

  /*/Draw speed test
  frames = 0;
  testtime = new Date().getTime();
  info.show();
  volume.draw(false, true);*/

  if (!state.properties.nogui) {
    var gui = new dat.GUI();
    hSave = gui.add(guiObj, 'saveItem', presetList).name('Preset').listen();
    hSave.onFinishChange(function(value) {
      guiObj.saveItem = value;
			// load setting and update gui
			let preset = 'vol_web.json';
			if(value !== 'default') preset = 'vol_web_' + value + '.json';
			let parts = window.location.href.split('?');
			window.location.href = parts[0] + '?data=data/tags/' + tag + '/volume_result/' + preset + '&reset';
		});
    
    
    //gui.add({"Restore" : function() {resetFromData(state);}}, 'Restore')
    gui.add({"Save" : function() {saveDataJson();}}, 'Save');
    gui.add({"SaveAs": function() {saveDataJsonAs();}}, 'SaveAs').name('Save As');
    //gui.add({"Export" : function() {exportData();}}, 'Export');
    //gui.add({"loadFile" : function() {document.getElementById('fileupload').click();}}, 'loadFile'). name('Load Image file');
    
    gui.add({"ColourMaps" : function() {window.colourmaps.toggle();}}, 'ColourMaps');

    var f = gui.addFolder('Views');
    var ir2 = 1.0 / Math.sqrt(2.0);
    f.add({"XY" : function() {volume.rotate = quat4.create([0, 0, 0, 1]);}}, 'XY');
    f.add({"YX" : function() {volume.rotate = quat4.create([0, 1, 0, 0]);}}, 'YX');
    f.add({"XZ" : function() {volume.rotate = quat4.create([ir2, 0, 0, -ir2]);}}, 'XZ');
    f.add({"ZX" : function() {volume.rotate = quat4.create([ir2, 0, 0, ir2]);}}, 'ZX');
    f.add({"YZ" : function() {volume.rotate = quat4.create([0, -ir2, 0, -ir2]);}}, 'YZ');
    f.add({"ZY" : function() {volume.rotate = quat4.create([0, -ir2, 0, ir2]);}}, 'ZY');

    if (volume) volume.addGUI(gui);
    if (slicer) slicer.addGUI(gui);
    
    // update presets
    socket.emit('getsavelist', { type: 'volume', tag:  tag});
  }

  //Save props on exit
  window.onbeforeunload = saveData;
}

/////////////////////////////////////////////////////////////////////////
function autoResize() {
  if (volume) {
    volume.width = 0; //volume.canvas.width = window.innerWidth;
    volume.height = 0; //volume.canvas.height = window.innerHeight;
    volume.draw();
  }
}

function updateColourmap() {
  if (!colours) return;
  var gradient = $('gradient');
  colours.palette.draw(gradient, false);

  if (volume && volume.webgl) {
    volume.webgl.updateTexture(volume.webgl.gradientTexture, gradient, volume.gl.TEXTURE1);  //Use 2nd texture unit
    volume.applyBackground(colours.palette.background.html());
    volume.draw();
  }

  if (slicer) {
    slicer.updateColourmap();
    slicer.draw();
  }
}

var request, progressBar;

    function loadImage(imageURI, callback)
    {
        request = new XMLHttpRequest();
        request.onloadstart = showProgressBar;
        request.onprogress = updateProgressBar;
        request.onload = callback;
        request.onloadend = hideProgressBar;
        request.open("GET", imageURI, true);
        request.responseType = 'arraybuffer';
        request.send(null);
    }
    
    function showProgressBar()
    {
        progressBar = document.createElement("progress");
        progressBar.value = 0;
        progressBar.max = 100;
        progressBar.removeAttribute("value");
        document.getElementById('status').appendChild(progressBar);
    }
    
    function updateProgressBar(e)
    {
        if (e.lengthComputable)
            progressBar.value = e.loaded / e.total * 100;
        else
            progressBar.removeAttribute("value");
    }
    
    function hideProgressBar()
    {
      document.getElementById('status').removeChild(progressBar);
    }

/**
 * @constructor
 */
function Popup(id, x, y) {
  this.el = $(id);
  this.style = $S(id);
  if (x && y) {
    this.style.left = x + 'px';
    this.style.top = y + 'px';
  } else {
    this.style.left = ((window.innerWidth - this.el.offsetWidth) * 0.5) + 'px';
    this.style.top = ((window.innerHeight - this.el.offsetHeight) * 0.5) + 'px';
  }
  this.drag = false;
}

Popup.prototype.toggle = function() {
  if (this.style.visibility == 'visible')
    this.hide();
  else
    this.show();
}

Popup.prototype.show = function() {
  this.style.visibility = 'visible';
}

Popup.prototype.hide = function() {
  this.style.visibility = 'hidden';
}

