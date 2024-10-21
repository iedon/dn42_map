var resizeTimer = null, wnfo_lt = null;
var width = window.innerWidth, 
	height = window.innerHeight, 
	width2 = width / 2,
	height2 = height / 2;
// gi: src, gi1: target, gi2: mouse over, gi3: select
var gi = 'orange', gi1 = '#667dfd', gi2 = '#ff5830', gi3 = 'red', gv = gi;
var svg, link, lm, force, node, cmover, zoom, cmprev = "", tx, ty, idcache = new Array(), asdb = new Array();
var tnf = 1;
var prevsel = '';
var kt, cfsel, cfdw, hst;
var omot, omot2, hl = 0, p_hl = 1;
var afa = 0, mafa, ball = 2, iv1;
var crfr = false, crfrt;
var cvld = 200.0, cvg = 0.25, cvch = -2200, cvlst = 1, cscale = 0.8, cvfr = 0.75;
var dbg = 0;
var swg = 1;
var aslist = new Array();
var fft1, fft2, fft3;
var ffish = 0;
var ncnt = 0;
var shift_down = false, ctrl_down = false;
var has_focus = true;
var t0;
var load_time0 = 0, load_time1 = 0, load_time2 = 0;
