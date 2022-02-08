function lh_nfo(n) {
	var i, v, cn = 0;
	if (!asdb[n]) {
		// alert ('error');
		return 0;
	}
	if ((asdb[n]['leafs'] != null || asdb[n]['hubs'] != null)
			&& asdb[n]['leafs'] > 0 && asdb[n]['leafs'] > 0)
		return 1;

	asdb[n]['leafs'] = 0;
	asdb[n]['hubs'] = 0;

	for (i = 0; i < asdb[n]['c'] && asdb[n][i]; i++) {
		if (asdb[asdb[n][i]]) {
			if (asdb[asdb[n][i]].length > 1) {
				asdb[n]['hubs']++;
			} else if (asdb[asdb[n][i]].length <= 1) {
				asdb[n]['leafs']++;
			}
		}
	}

}

function sc_lnfo() {
	$('.lnfo').stop().animate({
		top : +$('#txti').height() + 16 + 'px'
	}, 120);
}

function hide_wnfo(n) {
	if (tnf == 0)
		return 0;
	if (omot2)
		clearTimeout(omot2);
	omot2 = setTimeout("fhw()", n);
}

function show_wnfo(n) {
	if (tnf == 0)
		return 0;
	if (!n)
		fsw();
	else {
		if (omot2)
			clearTimeout(omot2);
		omot2 = setTimeout("fsw()", n);
	}
}

function fsel(as) {
	cmover = as;
	cfsel = as;
	dasn(as, 3);
	center_as(as);
}

function find_wnfo() {
	var as = parseInt(document.getElementById('txti').value);
	if (!as)
		return;

	if (document.getElementById(as) != null && cfdw)
		fsel(as);
	else
		ks(1);
}

function ks(v) {
	if (cfsel && cfsel == cmprev) {
		hide_wnfo(0);
		cfsel = null;
		clin();
		cmprev=null;
	}
	if (v != 1) {
		cfdw = false;
	}
}

function hints_on(t)
{
	if (dbg) {
		$('.dbg').fadeOut(120, 'swing');
		dbg = 0;
	}
	$('#hint').fadeIn(400, 'swing');
	if ( t )
	{
		if (hst)
			clearTimeout(hst);
		hst = setTimeout('hints_off();', t);
	}
}

function hints_off()
{
	$('#hint').fadeOut(250, 'swing');
}

function toggle_hints() {
	if ($('#hint').css('display') == "none")
		hints_on(30000);
	else
		hints_off();
}

function lh_on()
{
	p_hl = 1;
	if (!lul(cmprev))
		s_notice('Link highlighting ON');
	if (cfdw)
		$('.lnfo').css('top', $('#txti').height() + 16 + 'px');
	$('.lnfo').fadeIn(120, 'swing');
}

function lh_off()
{
	if (!clin('', 1))
		s_notice('Link highlighting OFF');
	p_hl = 0;
	$('.lnfo').fadeOut(190, 'swing');
}

function i_on()
{
	tnf = 1;
	dasn(prevsel, 2);
}

function i_off()
{
	hide_wnfo(0);
	tnf = 0;
}

function a_on()
{
	$('.anfo').fadeIn(120, 'swing');
	l_cas(cmover);
}

function a_off(inst)
{
	if ( inst )
		$('.anfo').css('display', 'none')
	else
		$('.anfo').fadeOut(120, 'swing');
}

function fsw() {
	$('.wnfo').fadeIn(100, 'swing');
}
function fhw() {
	$('.wnfo').fadeOut(130, 'swing');
}

function fop(e) {
	if ($('#txti').css('display') == "none") {
		sc_lnfo();
		$('#txti').fadeIn(96, 'swing', function() {
			setFocus('txti');
			cfdw = true;
			find_wnfo();
			});
	} else {
		$('#txti').fadeOut(100, 'swing', function() {
			$('.lnfo').stop().animate({
				top : 12
			}, 200);
			ks(2);
		});
	}
	return true;
}

function get_dimensions()
{
	width = window.innerWidth;
	height = window.innerHeight;
	width2 = width/2;
	height2 = height/2;
}

function svg_center_zoom() {
	zoom.translate([ width / 2 - ((width * cscale) / 2),
			height / 2 - ((height * cscale) / 2) ]);
	azoom();
}

function svg_translate(x,y) {
	zoom.translate([x , y ]);
	azoom();
}

function svg_scale(n) {
	zoom.scale(n);
	azoom();
}

function dbg_on() {
	dbg = 1;
	if ($('.dbg').css('display') == "none") {
		$('.dbg').fadeIn(120, 'swing');
		if ($('#hint').css('display') != "none")
			toggle_hints();
		h_dbg();
	}
}
