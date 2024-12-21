function aao(n, v) {
	if (!n || !v)
		return -1;
	init_asdb(n);
	init_asdb(v);
	var found = false;
	for (var i = 0; i < asdb[n].length; i++) {
		if (asdb[n][i] == v) {
			found = true;
			break;
		}
	}
	if (!found) {
		asdb[n][asdb[n]['c']] = v;
		asdb[n]['hc'] = gi;
		asdb[n]['c']++;
	}
	found = false;
	for (var j = 0; j < asdb[v].length; j++) {
		if (asdb[v][j] == n) {
			found = true;
			break;
		}
	}
	if (!found) {
		asdb[v][asdb[v]['c']] = n;
		asdb[v]['c']++;
		asdb[v]['hc'] = gi;
	}
}

function init_asdb(k) {
	if (k !== undefined && k !== null && asdb[k] == null) {
		asdb[k] = new Array();
		asdb[k]['c'] = 0;
	}
}
