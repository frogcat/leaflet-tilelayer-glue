(function() {

  var defaultVertexShader = (function() {
    /*
attribute vec2 clip;
void main() {
  gl_Position = vec4(clip,0,1);
}
*/
  }).toString().split("/*")[1].split("*/")[0];

  var defaultfragmentShader = (function() {
    /*
precision mediump float;
uniform sampler2D image;
uniform vec2 unit;
uniform vec4 argv;
uniform float zoom;
void main() {
  vec2 p = vec2(gl_FragCoord.x,1.0 / unit.y - gl_FragCoord.y);
  gl_FragColor = texture2D(image,p * unit);
}
*/
  }).toString().split("/*")[1].split("*/")[0];


  L.TileLayer.GLUE = L.TileLayer.extend({
    options: {
      crossOrigin: true,
      vertexShader: defaultVertexShader,
      fragmentShader: defaultfragmentShader,
      errorTileColor: "#7f0000",
      argv: [0, 0, 0, 0]
    },
    _initContainer: function() {
      L.TileLayer.prototype._initContainer.call(this);

      var canvas = this._canvas = document.createElement('canvas');
      canvas.style.zIndex = 10000;
      canvas.style.position = "absolute";

      var gl = this._gl = canvas.getContext('webgl', null) || canvas.getContext('experimental-webgl');
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, this.options.vertexShader);
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, this.options.fragmentShader);
      gl.compileShader(fs);
      var pg = this._pg = gl.createProgram();
      gl.attachShader(pg, vs);
      gl.attachShader(pg, fs);
      gl.linkProgram(pg);
      if (gl.getProgramParameter(pg, gl.LINK_STATUS)) {
        gl.useProgram(pg);
      } else {
        console.log(gl.getProgramInfoLog(pg));
        return;
      }

      this._timer = NaN;

      this._map.on("moveend", function() {
        this._paint();
      }, this);

      this.on("tileload", function(event) {
        event.tile.style.display = "none";
      });
      this.on("tileload load loading", function(event) {
        this._paint();
      }, this);
    },

    _paint: function() {

      if (!isNaN(this._timer)) clearTimeout(this._timer);
      var that = this;
      this._timer = setTimeout(function() {
        that._doPaint();
        that._timer = NaN;
      }, 10);
    },

    _doPaint: function() {

      if (!this._map) return;

      var center = this._map.getCenter();
      var pixelBounds = this._getTiledPixelBounds(center);
      var tileRange = this._pxBoundsToTileRange(pixelBounds);
      var size = tileRange.getSize().add([1, 1]).scaleBy(this.getTileSize());
      var canvas = this._canvas;
      var shadow = document.createElement("canvas");
      canvas.width = shadow.width = size.x;
      canvas.height = shadow.height = size.y;
      canvas.style.width = size.x + "px";
      canvas.style.height = size.y + "px";
      this._level.el.appendChild(canvas);
      var context = shadow.getContext("2d");
      context.fillStyle = this.options.errorTileColor;
      context.fillRect(0, 0, size.x, size.y);
      var origin = this._getTilePos(tileRange.min);
      for (var key in this._tiles) {
        var tile = this._tiles[key];
        if (tile.current) {
          var pos = this._getTilePos(tile.coords).subtract(origin);
          try {
            context.drawImage(tile.el, pos.x, pos.y);
          } catch (ex) {}
        }
      }
      L.DomUtil.setPosition(canvas, origin);

      var image = shadow;
      var gl = this._gl;
      var program = this._pg;

      var w = image.width;
      var h = image.height;
      var clipLocation = gl.getAttribLocation(program, "clip");
      var unitLocation = gl.getUniformLocation(program, "unit");
      var zoomLocation = gl.getUniformLocation(program, "zoom");
      var argvLocation = gl.getUniformLocation(program, "argv");

      var clipBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, clipBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      // Create a texture.
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      gl.viewport(0, 0, w, h);
      gl.enableVertexAttribArray(clipLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, clipBuffer);
      gl.vertexAttribPointer(clipLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(unitLocation, 1 / w, 1 / h);
      gl.uniform1f(zoomLocation, this._tileZoom);

      var argv = this.options.argv;
      gl.uniform4f(argvLocation, argv[0], argv[1], argv[2], argv[3]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  });

  L.tileLayer.glue = function(url, options) {
    return new L.TileLayer.GLUE(url, options);
  };

})();
