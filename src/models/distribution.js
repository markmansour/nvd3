
nv.models.sparkline = function() {
  var margin = {top: 0, right: 0, bottom: 0, left: 0},
      length = 400,
      size = 8,
      axis = 'x', // 'x' or 'y'... horizontal or vertical
      getData = function(d) { return d[axis] },  // defaults d.x or d.y
      color = d3.scale.category20().range(),
      domain;

  var scale = d3.scale.linear();

  function chart(selection) {
    selection.each(function(data) {
      var availableLength = length - (axis === 'x' ? margin.left + margin.right : margin.top + margin.bottom),
          naxis = axis == 'x' ? 'y' : 'x';

      //store old scales if they exist
      scale0 = scale0 || scale;

      scale
          .domain(domain || d3.extent(data, getData))
          .range([0, availableLength]);


      var wrap = d3.select(this).selectAll('g.distribution').data([data]);

      var gEnter = wrap.enter().append('g').attr('class', 'nvd3 distribution');
      gEnter
          .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

      var g = wrap.select('g');

      var distWrap = g.selectAll('g.dist')
          .data(function(d) { return d }, function(d) { return d.key });

      distWrap.enter().append('g')
          .attr('class', function(d,i) { return 'dist series-' + i });
      distWrap
        .style('stroke', function(d,i) { return color.filter(function(d,i) { return data[i] && !data[i].disabled })[i % color.length] });

      var dist = distWrap.selectAll('line.dist' + axis)
          .data(function(d) { return d.values })
      dist.enter().append('line')
          .attr(axis + '1', function(d,i) { return scale0(getData(d,i)) })
          .attr(axis + '2', function(d,i) { return scale0(getData(d,i)) })
      d3.transition(distWrap.exit().selectAll('line.dist' + axis))
          .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
          .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })
          .remove();
      dist
          .attr('class', function(d,i) { return 'dist' + axis + ' dist-' + i })
          .attr(naxis + '1', 0)
          .attr(naxis + '2', size);
      d3.transition(dist)
          .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
          .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })


      scale0 = scale.copy();

    });

    return chart;
  }


  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin = _;
    return chart;
  };

  chart.length = function(_) {
    if (!arguments.length) return length;
    length = _;
    return chart;
  };

  chart.size = function(_) {
    if (!arguments.length) return size;
    size = _;
    return chart;
  };

  chart.getData = function(_) {
    if (!arguments.length) return getData;
    getData = d3.functor(_);
    return chart;
  };

  chart.domain = function(_) {
    if (!arguments.length) return domain;
    domain = _;
    return chart;
  };

  return chart;
}