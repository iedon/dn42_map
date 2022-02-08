var vl_prev;

function select_color(n, v) {
	if ($('#__' + n).attr("fill") == gi1 && !v)
		return;

	if (prevsel && prevsel != n &&
		$('#__' + prevsel).attr("fill") == gi2) 
		$('#__' + prevsel).attr("fill", gi);

	prevsel = n;

	if ( $('#__' + n).attr("fill") != gi3 ) 
		$('#__' + n).attr("fill", gi2);
}

var wl_dt;

function wl_dasn(n, t) {
	wl_dasn_out();
	window.wl_dt = setTimeout("dasn('"+n+"', '"+t+"');", 100);
}

function wl_dasn_out() {
	if ( window.wl_dt ) {
		clearTimeout(window.wl_dt);
	}
}

function l_cas(n) {
	var i, o3;

	if ($('.anfo').css('display') == "none")
		return 2;

	if (asdb[n] == null)
		return 1;

	o3 = '<pre>';
	for (i = 0; i < asdb[n]['c'] && asdb[n][i]; i++) {
		if (i && !(i % 4))
			o3 += '\n';
		if (i)
			o3 += ' ';
		// o3 += '<uspec91 onmouseout="wl_dasn_out();" onmouseover="wl_dasn('+asdb[n][i]+', 4);" onclick="dasn('+asdb[n][i]+');">'+asdb[n][i]+'</uspec91>';
		var desc = asdb[asdb[n][i]].dref.desc || asdb[n][i];
		desc = desc.replace('-DN42', '').replace('-MNT', '').replace('-AS', '');
		o3 += '<uspec91 onmouseout="wl_dasn_out();" onmouseover="wl_dasn('+asdb[n][i]+', 4);" onclick="dasn('+asdb[n][i]+');">'+desc+'</uspec91>';
	}
	o3 = o3 + '</pre>';
	$('.anfo').html(o3.replace(/(\n\s)/g, '\n').replace(/^\s/g, 's'));
}

function dasn(n, v, t) {
	if (v == 3) {
		show_wnfo(0);
		lul(n);
		$('#__' + n).attr("fill", gi3);
	}

	if ( v!= 4 && vl_prev && vl_prev != cmprev && n == cmprev ) {
		v = 4;
	} else {
		if (n == cmprev && v != 2) {
			return 3;
		}
	}

	if (v == 1 && n != cmover) {
		return 6;
	} else if ( v == 2 && n != cmprev) 
		n = cmprev;

	if (v != 2 && v != 4) {
		lh_nfo(n);
		//select_color(n, 1);
		if ( cmprev && cmprev != n )
			$('#__' + cmprev).attr("fill", gi);

		$('#__' + n).attr("fill", gi3);
		lul(n);
		d_lnfo(n);
		l_cas(n);
		h_dbg(n);
	}

	if ( v != 4 )
		cmprev = n;

	vl_prev = n;

	if (!tnf)
		return 7;

	if (idcache[n]) {
		$('.wnfo').html(idcache[n]);
	} else {
		$('.wnfo').html('Loading whois..');
		$.ajax({
			type: "POST",
			url: host + "/whois",
			dataType: 'json',
			contentType: "application/json",
			data: JSON.stringify({ asn: n }),
			cache: true,
			success: function(data) {
				if (!data.whois) {
					$('.wnfo').html('Error querying whois api');
				} else {
					var url_regex = /(http:\/\/|https:\/\/)((\w|=|\?|\.|\/|&|-)+)/g;
					data.whois = data.whois.replace(url_regex, "<a href='$1$2' target='_blank'>$1$2</a>").replace(/\n/g, "<br/>");
					_prefix = '<pre><a href="' + explorerHost + n + '" target="_blank">View all objects at Collector</a><br/>'
					_suffix = '</pre>'
					proceed = _prefix + data.whois + _suffix;
					$('.wnfo').html(proceed);
					idcache[n] = proceed;
				}
			},
			error: function() {
				$('.wnfo').html('Error querying whois api');
			}
		});
	}
	show_wnfo(0);
	return 1;
}

function d_lnfo(n) {
	var db = '<pre>';

	if (!n || !asdb[n])
		return 1;

	db = db + 'AS' + n + ' ';

	if (asdb[n].length > 1)
		db = db + '(hub)';
	else
		db = db + '(leaf)';

	db = db + '\n\n';

	if (asdb[n].length)
		db = db + 'Neighbors: ' + asdb[n].length + '\n';
	else
		return 0;

	if (asdb[n]['hubs'] != null && asdb[n]['hubs'] > 1)
		db = db + 'Hubs: ' + asdb[n]['hubs'] + '\n';

	if (asdb[n]['leafs'] != null && asdb[n]['leafs'] > 0)
		db = db + 'Leafs: ' + asdb[n]['leafs'] + '\n';

	db = db + '</pre>';

	$('.lnfo').html(db);

	if (p_hl == 1 && $('.lnfo').css('display') == 'none')
		$('.lnfo').fadeIn(300, 'swing');
}

function lul(n) {
	var i;
	if (asdb[n] == null)
		return 1;
	if (!p_hl)
		return 0;

	if (hl == 1)
		clin(n);

	for (i = 0; i < asdb[n]['c'] && asdb[n][i]; i++) {
		elin(n + '-' + asdb[n][i], swg + (1.5 * swg), 'orange');
		elin(asdb[n][i] + '-' + n, swg + (1.5 * swg), 'orange');
		$('#__' + asdb[n][i]).attr("fill", gi1);
		asdb[n]['hc'] = gi1;
	}
	hl = 1;
	return 0;
}

function elin(n, v, t) {

	if ($('#' + n)) {
		$('#' + n).css('stroke-width', v);
		$('#' + n).css('stroke', t);
	}
}

function clin(n, v) {
	var i;
	if (asdb[cmprev] == null)
		return 1;
	if (!p_hl || !cmprev)
		return 0;
	for (i = 0; i < asdb[cmprev]['c'] && asdb[cmprev][i]; i++) {
		elin(asdb[cmprev][i] + '-' + cmprev, swg, '#0b5838');
		elin(cmprev + '-' + asdb[cmprev][i], swg, '#0b5838');
		if (n != asdb[cmprev][i]) {
			$('#__' + asdb[cmprev][i]).attr("fill", gi);
			asdb[cmprev]['hc'] = gi;
		}
	}
	if (!v)
		$('#__' + cmprev).attr("fill", gi);
	hl = 0;
	return 0;
}

function c(n,f) {
	if (cmover == null)
		cmover = n;
	select_color(n);
	wl(n,null,f);
}

function wl(n, t, f)
{
	if (wnfo_lt)
		clearTimeout(wnfo_lt);
	wnfo_lt = setTimeout('dasn(' + n + ',1,' + t + '); crun("'+f+'")', 50);
}

function om() {
	cmover = null;
}

function h_dbg(v) {
	if ( !dbg )
		return;

	var n;
	if (v)
		n = v;
	else
		n = cmprev;

	var o = '<pre>';
	var zt = zoom.translate();

	o += 'loadtimes (ms): ' +
		load_time0.toFixed(2) + ' / ' +
		load_time1.toFixed(2) + ' / ' +
		load_time2.toFixed(2) + '\n\n';

	o += 'alpha: '+ force.alpha().toFixed(12) +'\n'

	o += 'ldist:' + cvld.toFixed(0) + ' charge:' + cvch.toFixed(0)
			+ ' grav:' + cvg.toFixed(3) + ' frict:' + cvfr.toFixed(2) + '\n' +
			'scale:'+ zoom.scale().toFixed(9) + '\n' + 'mcoord:x:'
			+ zt[0].toFixed(5) + ' y:' + zt[1].toFixed(5) + '\n\n';

	var asdbi = asdb[n];
	if ( asdbi ) {
		if (n) {
			o += 'cid:' + n + '\n';
			o += 'ncoord:x:' + asdbi['dref'].x.toFixed(5) + ' y:'
					+ asdbi['dref'].y.toFixed(5) + '\n';
		}
	}
	o += '</pre>';

	if ( o != $('.dbg').html() ) 
		$('.dbg').html(o);
}

var nott = Array();

function s_notice(n, v, p, ttr) {
	if ( !p ) p='.notice';

	$(p).html(n);

	if (!v) v = 2300;

	$(p).fadeIn(ttr != null ? ttr : 700, 'swing');

	if (nott[p])
		clearTimeout(nott[p]);

	nott[p] = setTimeout('if ( nott["'+p+'"] ) { $("'+p+'").fadeOut(400, "swing"); nott["'+p+'"]=null;}', v);
}

function clear_fixed()
{
	var n = node[0];
	var i = n.length; 
	while (i--) { 
		n[i].__data__.fixed = false; 
	}
}

function center_as(n)
{
	if ( n == null || !asdb[n] )
		return;

	svg_translate ( 
		(width / 2 ) - asdb[n]['dref'].x * cscale, 
		(height / 2 ) - asdb[n]['dref'].y * cscale 
	);
}

