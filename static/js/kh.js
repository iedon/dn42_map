$('#txti').keyup(function(e) {

	if (e.which == 70 || e.which == 102 || e.which == 17)
		return false;
	if ((e.which == 0x63 || e.which == 0x43 || e.which == 0x49
			|| e.which == 0x69 || e.which == 0x48 || e.which == 0x68))
		return false;
	if (kt)
		clearTimeout(kt);
	kt = setTimeout(function() {
		find_wnfo();
	}, 60);
	return true;
});

$(document).keydown(function(e) {
	switch ( e.which )
	{
		case 0x10:
			shift_down = true;
			break;
		case 0x11:
			ctrl_down = true;
			break;
	}
});

$(document).keyup(function(e) {
	switch ( e.which )
	{
		case 0x10:
			shift_down = false;
			break;
		case 0x11:
			ctrl_down = false;
			break;
	}
});

$('#txti').keypress(function(e) {
	if (e.which != 127 && e.which != 8 && e.which != 0
			&& String.fromCharCode(e.which).match(/^[0-9\.a-zA-Z\-]$/) == null)
		return false;
	return true;
});

shortcut.add("Shift+x+X", function(e) {
	stop_contmov();
	force.stop();
	crfr = false;
	s_notice("Halting movement");
	return true;
});

shortcut.add("Shift+h+H", function(e) {
	return toggle_hints();
});

shortcut.add("Shift+s+S", function(e) {
	return fop(1);
});

shortcut.add("Shift+w+W", function(e) {
	svg_center_zoom();
	s_notice("Centering viewport");
	return true;
});

shortcut.add("Shift+g+G", function(e) {
	clear_fixed()
	force.resume();
	return true;
});

shortcut.add("Shift+t+T", function(e) {
	hide_wnfo(0);
	cfsel = null;
	clin();
        cmprev = null;
	cmover = null;
	s_notice('Clearing node selection');
	return true;
});

shortcut.add("Shift+v+V", function(e) {
	if ( $('.link').css('display') == 'none' ) {
		$('.link').css('display', '');
		s_notice('Link visibility ON');
	} else {
		$('.link').css('display', 'none');
		s_notice('Link visibility OFF');
	}
});

shortcut.add("Shift+u+U", function(e) {
	if ($('.at').css('display') == "none")
		$('.at').css('display', '');
	else
		$('.at').css('display', 'none');
});

shortcut.add("Shift+e+E", function(e) {
	blur_pause = !blur_pause;
	if ( !blur_pause )
		s_notice('Background rendering ON');
	else
		s_notice('Background rendering OFF');
});

shortcut.add("Shift+c+C", function(e) {
	if ( !p_hl )
		lh_on();
	else
		lh_off();
});

shortcut.add("Shift+i+I", function(e) {
	if ($('.wnfo').css('display') == "none")
	{
		if (prevsel) {
			i_on();
			s_notice('AS info ON');
		}
	}
	else
	{
		i_off();
		s_notice('AS info OFF');
	}
});

shortcut.add("Shift+l+L", function(e) {
	if ($('.anfo').css('display') == "none")
		a_on();
	else
		a_off();
});

shortcut.add("Ctrl+f+F", function(e) {
	return fop(1);
});

shortcut.add("Esc", function(e) {
	if ($('#txti').css('display') != "none")
		fop(1);
});

shortcut.add("Shift+b+B", function(e) {
	if (ball == 2) {
		// svg_scale(0.6);
		// svg_center_zoom();
		ballup();
		s_notice('Ball shape', 1000);
	} else if (!ball) {
		expand_ball();
		ball = 1;
		s_notice('Ball expanded', 1000);
	} else {
		contract_ball();
		ball = 0;
		s_notice('Ball contracted', 1000);
	}
	h_dbg();
});

shortcut.add("Shift+n+N", function(e) {
	anim_n();
	ball = 2;
	h_dbg();
	s_notice('Default shape', 1000);
});

shortcut.add("Shift+a+A", function(e) {
	toggle_cont();
	if (crfr)
		s_notice('Continuous motion ON', 1000);
	else
		s_notice('Continuous motion OFF', 1000);
});

shortcut.add("Shift+d+D", function(e) {
	if ($('.dbg').css('display') == "none") {
		dbg_on();
		s_notice('Debug info ON');
	} else {
		$('.dbg').fadeOut(120, 'swing');
		dbg = 0;
		s_notice('Debug info Off');
	}
});

var sf_alpha = 0.033;

shortcut.add("Shift+PageUp", function(e) {
	cvfr += 0.01;
	force.friction(cvfr).alpha(sf_alpha);
	h_dbg();
	s_notice('FR: +', 500);
});

shortcut.add("Shift+PageDown", function(e) {
	cvfr -= 0.01;
	force.friction(cvfr).alpha(sf_alpha);
	h_dbg();
	s_notice('FR: -', 500);
});


shortcut.add("PageUp", function(e) {
	if (ball == 2) {
		cvld += 10;
		force.linkDistance(cvld).distance(cvld).alpha(sf_alpha);
		h_dbg();
		s_notice('D: +', 500);
	}
});

shortcut.add("PageDown", function(e) {
	if (ball == 2) {
		cvld -= 10;
		force.linkDistance(cvld).distance(cvld).alpha(sf_alpha);
		h_dbg();
		s_notice('D: -', 500);
	}
});

shortcut.add("Home", function(e) {
	cvch += 200;
	force.charge(cvch).alpha(sf_alpha);
	h_dbg();
	s_notice('CH: +', 500);
});

shortcut.add("End", function(e) {
	cvch -= 200;
	force.charge(cvch).alpha(sf_alpha);
	h_dbg();
	s_notice('C: -', 500);
});

shortcut.add("Insert", function(e) {
	cvg += 0.0010;
	force.gravity(cvg).alpha(sf_alpha);
	h_dbg();
	s_notice('G: +', 500);
});

shortcut.add("Delete", function(e) {
	cvg -= 0.0010;
	force.gravity(cvg).alpha(sf_alpha);
	h_dbg();
	s_notice('G: -', 500);
});

shortcut.add("Shift+f+F", function(e) {
	if (ffish == 1) {
		ffish = 0;
		s_notice('!', 1500);
	} else if (ffish == 0) {
		ffish = 1;
		force_fish(360);
		s_notice('?', 1500);
	}
});
