function contract_ball() {
	if (!afa)
		return;
	if (iv1)
		clearInterval(iv1);
	mafa = afa + 1;
	iv1 = setInterval(
			'if (afa <= 2200){t_p(6,-2200);clearInterval(iv1);}else {afa-=1*((mafa-afa)/1.14); t_p(6,-(afa))}',
			10);
}

function expand_ball() {
	if (iv1)
		clearInterval(iv1);
	afa = -force.charge();
	iv1 = setInterval(
			'if (afa > 12000) {clearInterval(iv1);} else { afa+=1*(afa/5.14); t_p(6,-(afa))}',
			10);
}

function force_apply()
{
	force.gravity(cvg).distance(cvld).charge(cvch)
                .linkStrength(cvlst).friction(cvfr).linkDistance(cvld);
	return force;
}

function anim_n() {
	force_apply().start();
}

function t_p(m, v1, v2) {
	// force.stop();
	if (m & 0x1)
		force.linkDistance(v1);

	if (m & 0x2 && v2) {
		force.linkStrength(v2);
	} else if (m & 0x2)
		force.linkStrength(0);
	if (m & 0x4) {
		if (!v2)
			v2 = v1;
		force.charge(v2);
	}

	force.start();
}

function stop_contmov()
{
	if (crfrt)
		clearInterval(crfrt);
}

var fa_inc;
function start_contmov()
{
	stop_contmov()
	fa_inc = force.alpha();
	crfrt = setInterval('force.alpha(fa_inc < contmax ? fa_inc+=0.0033 : contmax);', 25);
}

function toggle_cont()
{

	if (!crfr) {
		start_contmov();
		crfr = true;
	} else {
		stop_contmov();
		crfr = false;
	}
}

function ffcv(n) {
	if (fft3)
		clearTimeout(fft3);

	fft3 = setTimeout('force_fish(' + n + ',1);',
			parseInt(Math.random() * 1000));
}

function force_fish(n) {
	if (!ffish)
		return 0;
	if (fft1)
		clearTimeout(fft1);
	if (fft2)
		clearTimeout(fft2);
	if (fft3)
		clearTimeout(fft3);

	fft1 = setTimeout('t_p(2, null, 1);', 1);
	fft2 = setTimeout(
			't_p(6, cvch); fft3=setTimeout("force_fish('
					+ n + ');", ' + n + ');', 200);
}

function ballup() {
	force_apply();
	//force.gravity(cvg).distance(cvld).charge(cvch).linkStrength(cvlst);
	t_p(6, cvch);
	ball = 0;
}
