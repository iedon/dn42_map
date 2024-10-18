$(window).bind('resize', function() {
	get_dimensions()
	$('#container').css('height', height);
	$('#container').css('width', width);
	force.size([ width, height ]);
	svg_center_zoom();
	var alpha = force.alpha()
	force.alpha(alpha > 0 ? alpha+0.001 : 0.025);
});

$(document).ready(function() {
	if (!isNaN(sel_d))
		cvld = sel_d;
	if (!isNaN(sel_g))
		cvg = sel_g;
	if (!isNaN(sel_c))
		cvch = sel_c;
	if (!isNaN(sel_s))
		cscale = sel_s;
	if (!isNaN(sel_f))
		cvfr = sel_f;

	$('#lnfo').html('Initializing...');

	setTimeout(post_init, init_delay);
});

function post_init()
{
	select_proto(proto_v);
}

function pa_init_stage1()
{
	if (sel_dbg)
		dbg_on();

	if ( !sel_lh )
		lh_off();

	if ( !sel_ninfo )
		i_off();

	if ( !sel_a )
		a_off(true);
}

function pa_init_stage2()
{
	if (sel_cont) {
		force.alpha(0.001);
                start_contmov();
                crfr = true;
	}
}

function pa2()
{
	if (selq && selq.match('[0-9]{2,}')) {
		cmover = selq;
		prevsel = selq;
		c(selq, 'setTimeout(\'!(sel_center && cmprev) && center_as(cmprev);\', 250);');
	}

	if ( !sel_ltx )
		$('.at').css('display', 'none');

	if ( sel_center )
		svg_center_zoom();

	load_time2 = performance.now() - t0;

	$('.lnfo').css('display', 'none');

	var last_updated = ''
	if (timestamp) {
		function timeConverter(UNIX_timestamp){
			var a = new Date(UNIX_timestamp * 1000);
			var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
			var year = a.getFullYear();
			var month = months[a.getMonth()];
			var date = a.getDate();
			var hour = a.getHours();
			var min = a.getMinutes();
			var sec = a.getSeconds();
			var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
			return time;
		}
		last_updated = 'Last Update: ' + timeConverter(timestamp);
		s_notice(last_updated + '; ' + ncnt + ' Nodes', 30000);
		return;
	}
	s_notice(ncnt + ' Nodes', 30000);

}

function pa()
{
	load_time0 = performance.now() - t0;

	$('.link').css('display', 'none');

        $('#lnfo').html('Postprocessing..');

//        $('#lnfo').html('Stabilizing..');

	setTimeout(pa0, 0);
}

function stabilize()
{
	var s = 25;
	while(force.alpha() > 0.01 && s--) {
		force.tick();
	}

	if ( !s )
		console.log("WARNING: exceeded tick limit during stabilization");
}

function pa0()
{
	t0 = performance.now();

	//stabilize();
	azoom();
	h_dbg();

	load_time1 = performance.now() - t0;

	setTimeout(pa1, 0);
}

var l_alpha = 0;
var pa_init = false;

function pa1()
{
	t0 = performance.now();

	if (!hinty && !sel_dbg && sel_info)
		toggle_hints();

	hinty = 1;

	if ( sel_lv )
		$('.link').css('display', '');

	if ( !pa_init )
		pa_init_stage1();

	gen_aslist();

	window.onfocus = function() {
		if ( blur_pause ) {
			if ( l_alpha > 0 ) {
				s_notice("Resuming movement");
				force.alpha(l_alpha);
				l_alpha = 0;
			}
			if ( crfr )
				start_contmov();
		}
	};
	window.onblur = function() {
		if ( blur_pause ) {
			l_alpha = force.alpha();
			if ( l_alpha > 0 )
				s_notice("Suspending movement");
			if ( crfr )
				stop_contmov();
			force.stop();
		}
	};

	if (sel_ff) {
		ffish = 1;
		force_fish(sel_ff);
	}

	if ( !pa_init )
		pa_init_stage2();

	pa_init = true;

	if ( postload_fa )
		force.alpha(postload_fa);

        if (sel_ball)
                ballup();

        $('.node').css('display', '');

	load_time2 = performance.now() - t0;

	setTimeout(pa2, 0);

}

function gen_aslist() {
	ncnt = Object.keys(asdb).length;
}
