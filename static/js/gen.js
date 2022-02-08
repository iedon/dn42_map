var dragging = false;
var ptl = 0;
var timestamp = 0;
function azoom() {
	if ( dragging ) {
		svg.attr('transform', 'translate(' + ptl + ') scale('+zoom.scale()+ ')');
	} else {
		svg.attr('transform', 'translate(' + zoom.translate() + ') scale('+zoom.scale()+ ')');
	}
	cscale = zoom.scale();
	h_dbg();
}

function calc_node_size(b, d) {
	return b + (asdb[d].length / 6);
}
function calc_img_size(b, d) {
	return -(b + (asdb[d].length / 25));
}

function select_proto() {
	$('#lnfo').html('Loading...');
	s_notice("Loading...", 1000, '#lh', 0);
	hide_wnfo(0);
	$('.anfo').html('');
	cmprev=null;
	cmover=null;
	prevsel=null;
	toggle_hints();
	setTimeout(gen, 15);
	return true;
}

function gen() {
	t0 = performance.now();
    $('.lnfo').css('display', '');

	if (asdb && asdb.length) {
		asdb.length = 0;
	} else {
		asdb = new Array();
	}

	if ( force )
		force.stop();

	if ( $("#container") ) {
		$("#container").remove();
	}

	zoom = d3.behavior.zoom().scaleExtent([ 0.00000095, 10526.0 ]).translate(
			[ width / 2 - ((width * cscale) / 2),
			height / 2 - ((height * cscale) / 2) ])
			.scale(cscale).on("zoom", azoom);

	svg = d3.select("body").append("svg").call(zoom).
			attr("id", "container").attr("width", width).attr("height",height).
			append("g").attr("id", "viewport");

	force = d3.layout.force().size([ width, height ])

	force_apply();

	d3.json(aspath, function(json) {
		timestamp = json.metadata.timestamp;
		var n = json.nodes.length;
		force.nodes(json.nodes).links(json.links);
		var x = 0;
		json.nodes.forEach(function(d, i) { d.x = d.y = width / n * i; init_asdb(d.asn); asdb[d.asn]['dref'] = d; });

		force.start();
		for (var i = n; i > 0; --i) force.tick();
		force.stop();

		var ox = 0, oy = 0;
		json.nodes.forEach(function(d) { ox += d.x, oy += d.y; });
		ox = ox / n - width / 2, oy = oy / n - height / 2;
		json.nodes.forEach(function(d) { d.x -= ox, d.y -= oy; });

		link = svg.selectAll(".link").data(json.links).enter().append("line")
				.attr("class", "link").attr("id", function(d) {
					aao(d.source.asn, d.target.asn);
					return d.source.asn + '-' + d.target.asn;
				})
				.call(pa);

		node = svg.selectAll(".node")
				.data(json.nodes).enter().append("g")
				.attr("class", "node")
				.attr("id", function(d) {
					return d.asn;
				})
				.attr("onmouseover", function(d) {
					return "c(" + d.asn + ");";
				})
				.attr("onmouseout", "om();")
				.on("click", function(d) {
					if ( ctrl_down )
						center_as(parseInt(d.asn));
				})
				.call(force.drag);

		force.drag().on("dragstart", function(d) {
			dragging = true;
			ptl = zoom.translate();
		}).on("dragend", function(d) {
			d.fixed = shift_down;
			zoom.translate(ptl);
			dragging = false;
		});

		node.append("circle")
			.attr("cx", function(d) {
				return calc_img_size(0, d.asn);
			})
			.attr("cy", function(d) {
				return calc_img_size(0, d.asn);
			})
			.attr("id", function(d) {
				return '__' + d.asn;
			})
			.attr("class", "ai")
			.attr("fill", "orange")
			.attr("r", function(d) {
				return calc_node_size(8, d.asn);
			})

		node.append("text").attr("dx", 12)
			.attr("id", function(d) {
				return '_' + d.desc;
			})
			.attr("class", "ntx")
			.attr("dy", 5) /* 0 */
			.style("fill", "#eee")
			.style("font-size", "16px")
			.style("font-weight", "bold")
			.attr("class", "at")
			.text(function(d) {
				return d.desc.replace('-DN42', '').replace('-MNT', '').replace('-AS', '');
			}) //.call(azoom);

/*
		node.append("text").attr("dx", 12)
			.attr("id", function(d) {
				return '_' + d.asn;
			})
			.attr("class", "ntx")
			.attr("dy", 10)
			.style("fill", "#ccc")
			.style("font-size", "10px")
			.style("font-weight", "normal")
			.attr("class", "at")
			.text(function(d) {
				return d.asn;
			}) //.call(azoom);
*/
		force.on("tick", function() {
			link.attr("x1", function(d) {
				return d.source.x;
			}).attr("y1", function(d) {
				return d.source.y;
			}).attr("x2", function(d) {
				return d.target.x;
			}).attr("y2", function(d) {
				return d.target.y;
			});

			h_dbg();
			node.attr("transform", function(d) {
				return "translate(" + d.x + "," + d.y + ")";
			});
		});

		/*$('.node').css('display', 'none');
		$('#lnfo').html('Stabilizing..');
		$('.lnfo').css('display', 'none');
		azoom();*/
	});
}

