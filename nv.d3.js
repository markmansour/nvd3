(function(){

var nv = window.nv || {};


nv.version = '1.1.10b';
nv.dev = true //set false when in production

window.nv = nv;

nv.tooltip = {}; // For the tooltip system
nv.utils = {}; // Utility subsystem
nv.models = {}; //stores all the possible models/components
nv.charts = {}; //stores all the ready to use charts
nv.graphs = []; //stores all the graphs currently on the page
nv.logs = {}; //stores some statistics and potential error messages

nv.dispatch = d3.dispatch('render_start', 'render_end');

// *************************************************************************
//  Development render timers - disabled if dev = false

if (nv.dev) {
  nv.dispatch.on('render_start', function(e) {
    nv.logs.startTime = +new Date();
  });

  nv.dispatch.on('render_end', function(e) {
    nv.logs.endTime = +new Date();
    nv.logs.totalTime = nv.logs.endTime - nv.logs.startTime;
    nv.log('total', nv.logs.totalTime); // used for development, to keep track of graph generation times
  });
}

// ********************************************
//  Public Core NV functions

// Logs all arguments, and returns the last so you can test things in place
// Note: in IE8 console.log is an object not a function, and if modernizr is used
// then calling Function.prototype.bind with with anything other than a function
// causes a TypeError to be thrown.
nv.log = function() {
  if (nv.dev && console.log && console.log.apply)
    console.log.apply(console, arguments)
  else if (nv.dev && typeof console.log == "function" && Function.prototype.bind) {
    var log = Function.prototype.bind.call(console.log, console);
    log.apply(console, arguments);
  }
  return arguments[arguments.length - 1];
};


nv.render = function render(step) {
  step = step || 1; // number of graphs to generate in each timeout loop

  nv.render.active = true;
  nv.dispatch.render_start();

  setTimeout(function() {
    var chart, graph;

    for (var i = 0; i < step && (graph = nv.render.queue[i]); i++) {
      chart = graph.generate();
      if (typeof graph.callback == typeof(Function)) graph.callback(chart);
      nv.graphs.push(chart);
    }

    nv.render.queue.splice(0, i);

    if (nv.render.queue.length) setTimeout(arguments.callee, 0);
    else { nv.render.active = false; nv.dispatch.render_end(); }
  }, 0);
};

nv.render.active = false;
nv.render.queue = [];

nv.addGraph = function(obj) {
  if (typeof arguments[0] === typeof(Function))
    obj = {generate: arguments[0], callback: arguments[1]};

  nv.render.queue.push(obj);

  if (!nv.render.active) nv.render();
};

nv.identity = function(d) { return d; };

nv.strip = function(s) { return s.replace(/(\s|&)/g,''); };

function daysInMonth(month,year) {
  return (new Date(year, month+1, 0)).getDate();
}

function d3_time_range(floor, step, number) {
  return function(t0, t1, dt) {
    var time = floor(t0), times = [];
    if (time < t0) step(time);
    if (dt > 1) {
      while (time < t1) {
        var date = new Date(+time);
        if ((number(date) % dt === 0)) times.push(date);
        step(time);
      }
    } else {
      while (time < t1) { times.push(new Date(+time)); step(time); }
    }
    return times;
  };
}

d3.time.monthEnd = function(date) {
  return new Date(date.getFullYear(), date.getMonth(), 0);
};

d3.time.monthEnds = d3_time_range(d3.time.monthEnd, function(date) {
    date.setUTCDate(date.getUTCDate() + 1);
    date.setDate(daysInMonth(date.getMonth() + 1, date.getFullYear()));
  }, function(date) {
    return date.getMonth();
  }
);

/* Utility class to handle creation of an interactive layer.
This places a rectangle on top of the chart. When you mouse move over it, it sends a dispatch
containing the X-coordinate. It can also render a vertical line where the mouse is located.

dispatch.elementMousemove is the important event to latch onto.  It is fired whenever the mouse moves over
the rectangle. The dispatch is given one object which contains the mouseX/Y location.
It also has 'pointXValue', which is the conversion of mouseX to the x-axis scale.
*/
nv.interactiveGuideline = function() {
	"use strict";
	var tooltip = nv.models.tooltip();
	//Public settings
	var width = null
	, height = null
    //Please pass in the bounding chart's top and left margins
    //This is important for calculating the correct mouseX/Y positions.
	, margin = {left: 0, top: 0}
	, xScale = d3.scale.linear()
	, yScale = d3.scale.linear()
	, dispatch = d3.dispatch('elementMousemove', 'elementMouseout')
	, showGuideLine = true
	, svgContainer = null  
    //Must pass in the bounding chart's <svg> container.
    //The mousemove event is attached to this container.
	;

	//Private variables
	var isMSIE = navigator.userAgent.indexOf("MSIE") !== -1  //Check user-agent for Microsoft Internet Explorer.
	;


	function layer(selection) {
		selection.each(function(data) {
				var container = d3.select(this);
				
				var availableWidth = (width || 960), availableHeight = (height || 400);

				var wrap = container.selectAll("g.nv-wrap.nv-interactiveLineLayer").data([data]);
				var wrapEnter = wrap.enter()
								.append("g").attr("class", " nv-wrap nv-interactiveLineLayer");
								
				
				wrapEnter.append("g").attr("class","nv-interactiveGuideLine");
				
				if (!svgContainer) {
					return;
				}

                function mouseHandler() {
                      var d3mouse = d3.mouse(this);
                      var mouseX = d3mouse[0];
                      var mouseY = d3mouse[1];
                      var subtractMargin = true;
                      var mouseOutAnyReason = false;
                      if (isMSIE) {
                         /*
                            D3.js (or maybe SVG.getScreenCTM) has a nasty bug in Internet Explorer 10.
                            d3.mouse() returns incorrect X,Y mouse coordinates when mouse moving
                            over a rect in IE 10.
                            However, d3.event.offsetX/Y also returns the mouse coordinates
                            relative to the triggering <rect>. So we use offsetX/Y on IE.  
                         */
                         mouseX = d3.event.offsetX;
                         mouseY = d3.event.offsetY;

                         /*
                            On IE, if you attach a mouse event listener to the <svg> container,
                            it will actually trigger it for all the child elements (like <path>, <circle>, etc).
                            When this happens on IE, the offsetX/Y is set to where ever the child element
                            is located.
                            As a result, we do NOT need to subtract margins to figure out the mouse X/Y
                            position under this scenario. Removing the line below *will* cause 
                            the interactive layer to not work right on IE.
                         */
                         if(d3.event.target.tagName !== "svg")
                            subtractMargin = false;

                         if (d3.event.target.className.baseVal.match("nv-legend"))
                         	mouseOutAnyReason = true;
                          
                      }

                      if(subtractMargin) {
                         mouseX -= margin.left;
                         mouseY -= margin.top;
                      }

                      /* If mouseX/Y is outside of the chart's bounds,
                      trigger a mouseOut event.
                      */
                      if (mouseX < 0 || mouseY < 0 
                        || mouseX > availableWidth || mouseY > availableHeight
                        || (d3.event.relatedTarget && d3.event.relatedTarget.ownerSVGElement === undefined)
                        || mouseOutAnyReason
                        ) 
                      {
                      		if (isMSIE) {
                      			if (d3.event.relatedTarget 
                      				&& d3.event.relatedTarget.ownerSVGElement === undefined
                      				&& d3.event.relatedTarget.className.match(tooltip.nvPointerEventsClass)) {
                      				return;
                      			}
                      		}
                            dispatch.elementMouseout({
                               mouseX: mouseX,
                               mouseY: mouseY
                            });
                            layer.renderGuideLine(null); //hide the guideline
                            return;
                      }
                      
                      var pointXValue = xScale.invert(mouseX);
                      dispatch.elementMousemove({
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                      });
                }

				svgContainer
				      .on("mousemove",mouseHandler, true)
				      .on("mouseout",mouseHandler,true)
				      ;

				 //Draws a vertical guideline at the given X postion.
				layer.renderGuideLine = function(x) {
				 	if (!showGuideLine) return;
				 	var line = wrap.select(".nv-interactiveGuideLine")
				 	      .selectAll("line")
				 	      .data((x != null) ? [nv.utils.NaNtoZero(x)] : [], String);

				 	line.enter()
				 		.append("line")
				 		.attr("class", "nv-guideline")
				 		.attr("x1", function(d) { return d;})
				 		.attr("x2", function(d) { return d;})
				 		.attr("y1", availableHeight)
				 		.attr("y2",0)
				 		;
				 	line.exit().remove();

				}
		});
	}

	layer.dispatch = dispatch;
	layer.tooltip = tooltip;

	layer.margin = function(_) {
	    if (!arguments.length) return margin;
	    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
	    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
	    return layer;
    };

	layer.width = function(_) {
		if (!arguments.length) return width;
		width = _;
		return layer;
	};

	layer.height = function(_) {
		if (!arguments.length) return height;
		height = _;
		return layer;
	};

	layer.xScale = function(_) {
		if (!arguments.length) return xScale;
		xScale = _;
		return layer;
	};

	layer.showGuideLine = function(_) {
		if (!arguments.length) return showGuideLine;
		showGuideLine = _;
		return layer;
	};

	layer.svgContainer = function(_) {
		if (!arguments.length) return svgContainer;
		svgContainer = _;
		return layer;
	};


	return layer;
};

/* Utility class that uses d3.bisect to find the index in a given array, where a search value can be inserted.
This is different from normal bisectLeft; this function finds the nearest index to insert the search value.

For instance, lets say your array is [1,2,3,5,10,30], and you search for 28. 
Normal d3.bisectLeft will return 4, because 28 is inserted after the number 10.  But interactiveBisect will return 5
because 28 is closer to 30 than 10.

Unit tests can be found in: interactiveBisectTest.html

Has the following known issues:
   * Will not work if the data points move backwards (ie, 10,9,8,7, etc) or if the data points are in random order.
   * Won't work if there are duplicate x coordinate values.
*/
nv.interactiveBisect = function (values, searchVal, xAccessor) {
	  "use strict";
      if (! values instanceof Array) return null;
      if (typeof xAccessor !== 'function') xAccessor = function(d,i) { return d.x;}

      var bisect = d3.bisector(xAccessor).left;
      var index = d3.max([0, bisect(values,searchVal) - 1]);
      var currentValue = xAccessor(values[index], index);
      if (typeof currentValue === 'undefined') currentValue = index;

      if (currentValue === searchVal) return index;  //found exact match

      var nextIndex = d3.min([index+1, values.length - 1]);
      var nextValue = xAccessor(values[nextIndex], nextIndex);
      if (typeof nextValue === 'undefined') nextValue = nextIndex;

      if (Math.abs(nextValue - searchVal) >= Math.abs(currentValue - searchVal))
          return index;
      else
          return nextIndex
};/* Tooltip rendering model for nvd3 charts.
window.nv.models.tooltip is the updated,new way to render tooltips.

window.nv.tooltip.show is the old tooltip code.
window.nv.tooltip.* also has various helper methods.
*/
(function() {
  "use strict";
  window.nv.tooltip = {};

  /* Model which can be instantiated to handle tooltip rendering.
    Example usage: 
    var tip = nv.models.tooltip().gravity('w').distance(23)
                .data(myDataObject);

        tip();    //just invoke the returned function to render tooltip.
  */
  window.nv.models.tooltip = function() {
        var content = null    //HTML contents of the tooltip.  If null, the content is generated via the data variable.
        ,   data = null     /* Tooltip data. If data is given in the proper format, a consistent tooltip is generated.
        Format of data:
        {
            key: "Date",
            value: "August 2009", 
            series: [
                    {
                        key: "Series 1",
                        value: "Value 1",
                        color: "#000"
                    },
                    {
                        key: "Series 2",
                        value: "Value 2",
                        color: "#00f"
                    }
            ]

        }

        */
        ,   gravity = 'w'   //Can be 'n','s','e','w'. Determines how tooltip is positioned.
        ,   distance = 50   //Distance to offset tooltip from the mouse location.
        ,   snapDistance = 25   //Tolerance allowed before tooltip is moved from its current position (creates 'snapping' effect)
        ,   fixedTop = null //If not null, this fixes the top position of the tooltip.
        ,   classes = null  //Attaches additional CSS classes to the tooltip DIV that is created.
        ,   chartContainer = null   //Parent DIV, of the SVG Container that holds the chart.
        ,   position = {left: null, top: null}      //Relative position of the tooltip inside chartContainer.
        ,   enabled = true  //True -> tooltips are rendered. False -> don't render tooltips.
        //Generates a unique id when you create a new tooltip() object
        ,   id = "nvtooltip-" + Math.floor(Math.random() * 100000)
        ;

        //CSS class to specify whether element should not have mouse events.
        var  nvPointerEventsClass = "nv-pointer-events-none";

        //Format function for the tooltip values column
        var valueFormatter = function(d,i) {
            return d;
        };

        //Format function for the tooltip header value.
        var headerFormatter = function(d) {
            return d;
        };

        //By default, the tooltip model renders a beautiful table inside a DIV.
        //You can override this function if a custom tooltip is desired.
        var contentGenerator = function(d) {
            if (content != null) return content;

            if (d == null) return '';

            var html = "<table><thead><tr><td colspan='3'><strong class='x-value'>" + headerFormatter(d.value) + "</strong></td></tr></thead><tbody>";
            if (d.series instanceof Array) {
                d.series.forEach(function(item, i) {
                    html += "<tr>";
                    html += "<td class='legend-color-guide'><div style='background-color: " + item.color + ";'></div></td>";
                    html += "<td class='key'>" + item.key + ":</td>";
                    html += "<td class='value'>" + valueFormatter(item.value,i) + "</td></tr>"; 
                });
            }
            html += "</tbody></table>";
            return html;
        };

        var dataSeriesExists = function(d) {
            if (d && d.series && d.series.length > 0) return true;

            return false;
        };

        //In situations where the chart is in a 'viewBox', re-position the tooltip based on how far chart is zoomed.
        function convertViewBoxRatio() {
            if (chartContainer) {
              var svg = d3.select(chartContainer);
              if (svg.node().tagName !== "svg") {
                 svg = svg.select("svg");
              }
              var viewBox = (svg.node()) ? svg.attr('viewBox') : null;
              if (viewBox) {
                viewBox = viewBox.split(' ');
                var ratio = parseInt(svg.style('width')) / viewBox[2];
                
                position.left = position.left * ratio;
                position.top  = position.top * ratio;
              }
            }
        }

        //Creates new tooltip container, or uses existing one on DOM.
        function getTooltipContainer(newContent) {
            var body;
            if (chartContainer)
                body = d3.select(chartContainer);
            else
                body = d3.select("body");

            var container = body.select(".nvtooltip");
            if (container.node() === null) {
                //Create new tooltip div if it doesn't exist on DOM.
                container = body.append("div")
                    .attr("class", "nvtooltip " + (classes? classes: "xy-tooltip"))
                    .attr("id",id)
                    ;
            }
        

            container.node().innerHTML = newContent;
            container.style("top",0).style("left",0).style("opacity",0);
            container.selectAll("div, table, td, tr").classed(nvPointerEventsClass,true)
            container.classed(nvPointerEventsClass,true);
            return container.node();
        }

        

        //Draw the tooltip onto the DOM.
        function nvtooltip() {
            if (!enabled) return;
            if (!dataSeriesExists(data)) return;

            convertViewBoxRatio();

            var left = position.left;
            var top = (fixedTop != null) ? fixedTop : position.top;
            var container = getTooltipContainer(contentGenerator(data));

            if (chartContainer) {
                var svgComp = chartContainer.getElementsByTagName("svg")[0];
                var boundRect = (svgComp) ? svgComp.getBoundingClientRect() : chartContainer.getBoundingClientRect();
                var svgOffset = {left:0,top:0};
                if (svgComp) {
                    var svgBound = svgComp.getBoundingClientRect();
                    var chartBound = chartContainer.getBoundingClientRect();
                    svgOffset.top = Math.abs(svgBound.top - chartBound.top);
                    svgOffset.left = Math.abs(svgBound.left - chartBound.left);
                }
                //If the parent container is an overflow <div> with scrollbars, subtract the scroll offsets.
                //You need to also add any offset between the <svg> element and its containing <div>
                //Finally, add any offset of the containing <div> on the whole page.
                left += chartContainer.offsetLeft + svgOffset.left - 2*chartContainer.scrollLeft;
                top += chartContainer.offsetTop + svgOffset.top - 2*chartContainer.scrollTop;
            }

            if (snapDistance && snapDistance > 0) {
                top = Math.floor(top/snapDistance) * snapDistance;
            }

            nv.tooltip.calcTooltipPosition([left,top], gravity, distance, container);
            return nvtooltip;
        };

        nvtooltip.nvPointerEventsClass = nvPointerEventsClass;
        
        nvtooltip.content = function(_) {
            if (!arguments.length) return content;
            content = _;
            return nvtooltip;
        };

        nvtooltip.contentGenerator = function(_) {
            if (!arguments.length) return contentGenerator;
            if (typeof _ === 'function') {
                contentGenerator = _;
            }
            return nvtooltip;
        };

        nvtooltip.data = function(_) {
            if (!arguments.length) return data;
            data = _;
            return nvtooltip;
        };

        nvtooltip.gravity = function(_) {
            if (!arguments.length) return gravity;
            gravity = _;
            return nvtooltip;
        };

        nvtooltip.distance = function(_) {
            if (!arguments.length) return distance;
            distance = _;
            return nvtooltip;
        };

        nvtooltip.snapDistance = function(_) {
            if (!arguments.length) return snapDistance;
            snapDistance = _;
            return nvtooltip;
        };

        nvtooltip.classes = function(_) {
            if (!arguments.length) return classes;
            classes = _;
            return nvtooltip;
        };

        nvtooltip.chartContainer = function(_) {
            if (!arguments.length) return chartContainer;
            chartContainer = _;
            return nvtooltip;
        };

        nvtooltip.position = function(_) {
            if (!arguments.length) return position;
            position.left = (typeof _.left !== 'undefined') ? _.left : position.left;
            position.top = (typeof _.top !== 'undefined') ? _.top : position.top;
            return nvtooltip;
        };

        nvtooltip.fixedTop = function(_) {
            if (!arguments.length) return fixedTop;
            fixedTop = _;
            return nvtooltip;
        };

        nvtooltip.enabled = function(_) {
            if (!arguments.length) return enabled;
            enabled = _;
            return nvtooltip;
        };

        nvtooltip.valueFormatter = function(_) {
            if (!arguments.length) return valueFormatter;
            if (typeof _ === 'function') {
                valueFormatter = _;
            }
            return nvtooltip;
        };

        nvtooltip.headerFormatter = function(_) {
            if (!arguments.length) return headerFormatter;
            if (typeof _ === 'function') {
                headerFormatter = _;
            }
            return nvtooltip;
        };

        //id() is a read-only function. You can't use it to set the id.
        nvtooltip.id = function() {
            return id;
        };


        return nvtooltip;
  };


  //Original tooltip.show function. Kept for backward compatibility.
  // pos = [left,top]
  nv.tooltip.show = function(pos, content, gravity, dist, parentContainer, classes) {
      
        //Create new tooltip div if it doesn't exist on DOM.
        var   container = document.createElement('div');
        container.className = 'nvtooltip ' + (classes ? classes : 'xy-tooltip');

        var body = parentContainer;
        if ( !parentContainer || parentContainer.tagName.match(/g|svg/i)) {
            //If the parent element is an SVG element, place tooltip in the <body> element.
            body = document.getElementsByTagName('body')[0];
        }
   
        container.style.left = 0;
        container.style.top = 0;
        container.style.opacity = 0;
        container.innerHTML = content;
        body.appendChild(container);
        
        //If the parent container is an overflow <div> with scrollbars, subtract the scroll offsets.
        if (parentContainer) {
           pos[0] = pos[0] - parentContainer.scrollLeft;
           pos[1] = pos[1] - parentContainer.scrollTop;
        }
        nv.tooltip.calcTooltipPosition(pos, gravity, dist, container);
  };

  //Looks up the ancestry of a DOM element, and returns the first NON-svg node.
  nv.tooltip.findFirstNonSVGParent = function(Elem) {
            while(Elem.tagName.match(/^g|svg$/i) !== null) {
                Elem = Elem.parentNode;
            }
            return Elem;
  };

  //Finds the total offsetTop of a given DOM element.
  //Looks up the entire ancestry of an element, up to the first relatively positioned element.
  nv.tooltip.findTotalOffsetTop = function ( Elem, initialTop ) {
                var offsetTop = initialTop;
                
                do {
                    if( !isNaN( Elem.offsetTop ) ) {
                        offsetTop += (Elem.offsetTop);
                    }
                } while( Elem = Elem.offsetParent );
                return offsetTop;
  };

  //Finds the total offsetLeft of a given DOM element.
  //Looks up the entire ancestry of an element, up to the first relatively positioned element.
  nv.tooltip.findTotalOffsetLeft = function ( Elem, initialLeft) {
                var offsetLeft = initialLeft;
                
                do {
                    if( !isNaN( Elem.offsetLeft ) ) {
                        offsetLeft += (Elem.offsetLeft);
                    }
                } while( Elem = Elem.offsetParent );
                return offsetLeft;
  };

  //Global utility function to render a tooltip on the DOM.
  //pos = [left,top] coordinates of where to place the tooltip, relative to the SVG chart container.
  //gravity = how to orient the tooltip
  //dist = how far away from the mouse to place tooltip
  //container = tooltip DIV
  nv.tooltip.calcTooltipPosition = function(pos, gravity, dist, container) {

            var height = parseInt(container.offsetHeight),
                width = parseInt(container.offsetWidth),
                windowWidth = nv.utils.windowSize().width,
                windowHeight = nv.utils.windowSize().height,
                scrollTop = window.pageYOffset,
                scrollLeft = window.pageXOffset,
                left, top;

            windowHeight = window.innerWidth >= document.body.scrollWidth ? windowHeight : windowHeight - 16;
            windowWidth = window.innerHeight >= document.body.scrollHeight ? windowWidth : windowWidth - 16;

            gravity = gravity || 's';
            dist = dist || 20;

            var tooltipTop = function ( Elem ) {
                return nv.tooltip.findTotalOffsetTop(Elem, top);
            };

            var tooltipLeft = function ( Elem ) {
                return nv.tooltip.findTotalOffsetLeft(Elem,left);
            };

            switch (gravity) {
              case 'e':
                left = pos[0] - width - dist;
                top = pos[1] - (height / 2);
                var tLeft = tooltipLeft(container);
                var tTop = tooltipTop(container);
                if (tLeft < scrollLeft) left = pos[0] + dist > scrollLeft ? pos[0] + dist : scrollLeft - tLeft + left;
                if (tTop < scrollTop) top = scrollTop - tTop + top;
                if (tTop + height > scrollTop + windowHeight) top = scrollTop + windowHeight - tTop + top - height;
                break;
              case 'w':
                left = pos[0] + dist;
                top = pos[1] - (height / 2);
                var tLeft = tooltipLeft(container);
                var tTop = tooltipTop(container);
                if (tLeft + width > windowWidth) left = pos[0] - width - dist;
                if (tTop < scrollTop) top = scrollTop + 5;
                if (tTop + height > scrollTop + windowHeight) top = scrollTop + windowHeight - tTop + top - height;
                break;
              case 'n':
                left = pos[0] - (width / 2) - 5;
                top = pos[1] + dist;
                var tLeft = tooltipLeft(container);
                var tTop = tooltipTop(container);
                if (tLeft < scrollLeft) left = scrollLeft + 5;
                if (tLeft + width > windowWidth) left = left - width/2 + 5;
                if (tTop + height > scrollTop + windowHeight) top = scrollTop + windowHeight - tTop + top - height;
                break;
              case 's':
                left = pos[0] - (width / 2);
                top = pos[1] - height - dist;
                var tLeft = tooltipLeft(container);
                var tTop = tooltipTop(container);
                if (tLeft < scrollLeft) left = scrollLeft + 5;
                if (tLeft + width > windowWidth) left = left - width/2 + 5;
                if (scrollTop > tTop) top = scrollTop;
                break;
              case 'none':
                left = pos[0];
                top = pos[1] - dist;
                var tLeft = tooltipLeft(container);
                var tTop = tooltipTop(container);
                break;
            }


            container.style.left = left+'px';
            container.style.top = top+'px';
            container.style.opacity = 1;
            container.style.position = 'absolute'; 

            return container;
    };

    //Global utility function to remove tooltips from the DOM.
    nv.tooltip.cleanup = function() {

              // Find the tooltips, mark them for removal by this class (so others cleanups won't find it)
              var tooltips = document.getElementsByClassName('nvtooltip');
              var purging = [];
              while(tooltips.length) {
                purging.push(tooltips[0]);
                tooltips[0].style.transitionDelay = '0 !important';
                tooltips[0].style.opacity = 0;
                tooltips[0].className = 'nvtooltip-pending-removal';
              }

              setTimeout(function() {

                  while (purging.length) {
                     var removeMe = purging.pop();
                      removeMe.parentNode.removeChild(removeMe);
                  }
            }, 500);
    };

})();

nv.utils.windowSize = function() {
    // Sane defaults
    var size = {width: 640, height: 480};

    // Earlier IE uses Doc.body
    if (document.body && document.body.offsetWidth) {
        size.width = document.body.offsetWidth;
        size.height = document.body.offsetHeight;
    }

    // IE can use depending on mode it is in
    if (document.compatMode=='CSS1Compat' &&
        document.documentElement &&
        document.documentElement.offsetWidth ) {
        size.width = document.documentElement.offsetWidth;
        size.height = document.documentElement.offsetHeight;
    }

    // Most recent browsers use
    if (window.innerWidth && window.innerHeight) {
        size.width = window.innerWidth;
        size.height = window.innerHeight;
    }
    return (size);
};



// Easy way to bind multiple functions to window.onresize
// TODO: give a way to remove a function after its bound, other than removing all of them
nv.utils.windowResize = function(fun){
  if (fun === undefined) return;
  var oldresize = window.onresize;

  window.onresize = function(e) {
    if (typeof oldresize == 'function') oldresize(e);
    fun(e);
  }
}

// Backwards compatible way to implement more d3-like coloring of graphs.
// If passed an array, wrap it in a function which implements the old default
// behavior
nv.utils.getColor = function(color) {
    if (!arguments.length) return nv.utils.defaultColor(); //if you pass in nothing, get default colors back

    if( Object.prototype.toString.call( color ) === '[object Array]' )
        return function(d, i) { return d.color || color[i % color.length]; };
    else
        return color;
        //can't really help it if someone passes rubbish as color
}

// Default color chooser uses the index of an object as before.
nv.utils.defaultColor = function() {
    var colors = d3.scale.category20().range();
    return function(d, i) { return d.color || colors[i % colors.length] };
}


// Returns a color function that takes the result of 'getKey' for each series and
// looks for a corresponding color from the dictionary,
nv.utils.customTheme = function(dictionary, getKey, defaultColors) {
  getKey = getKey || function(series) { return series.key }; // use default series.key if getKey is undefined
  defaultColors = defaultColors || d3.scale.category20().range(); //default color function

  var defIndex = defaultColors.length; //current default color (going in reverse)

  return function(series, index) {
    var key = getKey(series);

    if (!defIndex) defIndex = defaultColors.length; //used all the default colors, start over

    if (typeof dictionary[key] !== "undefined")
      return (typeof dictionary[key] === "function") ? dictionary[key]() : dictionary[key];
    else
      return defaultColors[--defIndex]; // no match in dictionary, use default color
  }
}



// From the PJAX example on d3js.org, while this is not really directly needed
// it's a very cool method for doing pjax, I may expand upon it a little bit,
// open to suggestions on anything that may be useful
nv.utils.pjax = function(links, content) {
  d3.selectAll(links).on("click", function() {
    history.pushState(this.href, this.textContent, this.href);
    load(this.href);
    d3.event.preventDefault();
  });

  function load(href) {
    d3.html(href, function(fragment) {
      var target = d3.select(content).node();
      target.parentNode.replaceChild(d3.select(fragment).select(content).node(), target);
      nv.utils.pjax(links, content);
    });
  }

  d3.select(window).on("popstate", function() {
    if (d3.event.state) load(d3.event.state);
  });
}

/* For situations where we want to approximate the width in pixels for an SVG:text element.
Most common instance is when the element is in a display:none; container. 
Forumla is : text.length * font-size * constant_factor
*/
nv.utils.calcApproxTextWidth = function (svgTextElem) {
    if (svgTextElem instanceof d3.selection) {
        var fontSize = parseInt(svgTextElem.style("font-size").replace("px",""));
        var textLength = svgTextElem.text().length;

        return textLength * fontSize * 0.5; 
    }
    return 0;
};

/* Numbers that are undefined, null or NaN, convert them to zeros.
*/
nv.utils.NaNtoZero = function(n) {
    if (typeof n !== 'number' 
        || isNaN(n) 
        || n === null
        || n === Infinity) return 0;

    return n;
};

/*
Snippet of code you can insert into each nv.models.* to give you the ability to
do things like:
chart.options({
  showXAxis: true,
  tooltips: true
});

To enable in the chart:
chart.options = nv.utils.optionsFunc.bind(chart);
*/
nv.utils.optionsFunc = function(args) {
    if (args) {
      d3.map(args).forEach((function(key,value) {
        if (typeof this[key] === "function") {
           this[key](value);
        }
      }).bind(this));
    }
    return this;
};nv.models.axis = function() {
  "use strict";
  //============================================================
  // Public Variables with Default Settings
  //------------------------------------------------------------

  var axis = d3.svg.axis()
    ;

  var margin = {top: 0, right: 0, bottom: 0, left: 0}
    , width = 75 //only used for tickLabel currently
    , height = 60 //only used for tickLabel currently
    , scale = d3.scale.linear()
    , axisLabelText = null
    , showMaxMin = true //TODO: showMaxMin should be disabled on all ordinal scaled axes
    , highlightZero = true
    , rotateLabels = 0
    , rotateYLabel = true
    , staggerLabels = false
    , isOrdinal = false
    , ticks = null
    ;

  axis
    .scale(scale)
    .orient('bottom')
    .tickFormat(function(d) { return d })
    ;

  //============================================================


  //============================================================
  // Private Variables
  //------------------------------------------------------------

  var scale0;

  //============================================================


  function chart(selection) {
    selection.each(function(data) {
      var container = d3.select(this);


      //------------------------------------------------------------
      // Setup containers and skeleton of chart

      var wrap = container.selectAll('g.nv-wrap.nv-axis').data([data]);
      var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-axis');
      var gEnter = wrapEnter.append('g');
      var g = wrap.select('g')

      //------------------------------------------------------------


      if (ticks !== null)
        axis.ticks(ticks);
      else if (axis.orient() == 'top' || axis.orient() == 'bottom')
        axis.ticks(Math.abs(scale.range()[1] - scale.range()[0]) / 100);


      //TODO: consider calculating width/height based on whether or not label is added, for reference in charts using this component


      g.transition().call(axis);

      scale0 = scale0 || axis.scale();

      var fmt = axis.tickFormat();
      if (fmt == null) {
        fmt = scale0.tickFormat();
      }

      var axisLabel = g.selectAll('text.nv-axislabel')
          .data([axisLabelText || null]);
      axisLabel.exit().remove();
      switch (axis.orient()) {
        case 'top':
          axisLabel.enter().append('text').attr('class', 'nv-axislabel');
          var w = (scale.range().length==2) ? scale.range()[1] : (scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]));
          axisLabel
              .attr('text-anchor', 'middle')
              .attr('y', 0)
              .attr('x', w/2);
          if (showMaxMin) {
            var axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                           .data(scale.domain());
            axisMaxMin.enter().append('g').attr('class', 'nv-axisMaxMin').append('text');
            axisMaxMin.exit().remove();
            axisMaxMin
                .attr('transform', function(d,i) {
                  return 'translate(' + scale(d) + ',0)'
                })
              .select('text')
                .attr('dy', '0em')
                .attr('y', -axis.tickPadding())
                .attr('text-anchor', 'middle')
                .text(function(d,i) {
                  var v = fmt(d);
                  return ('' + v).match('NaN') ? '' : v;
                });
            axisMaxMin.transition()
                .attr('transform', function(d,i) {
                  return 'translate(' + scale.range()[i] + ',0)'
                });
          }
          break;
        case 'bottom':
          var xLabelMargin = 36;
          var maxTextWidth = 30;
          var xTicks = g.selectAll('g').select("text");
          if (rotateLabels%360) {
            //Calculate the longest xTick width
            xTicks.each(function(d,i){
              var width = this.getBBox().width;
              if(width > maxTextWidth) maxTextWidth = width;
            });
            //Convert to radians before calculating sin. Add 30 to margin for healthy padding.
            var sin = Math.abs(Math.sin(rotateLabels*Math.PI/180));
            var xLabelMargin = (sin ? sin*maxTextWidth : maxTextWidth)+30;
            //Rotate all xTicks
            xTicks
              .attr('transform', function(d,i,j) { return 'rotate(' + rotateLabels + ' 0,0)' })
              .style('text-anchor', rotateLabels%360 > 0 ? 'start' : 'end');
          }
          axisLabel.enter().append('text').attr('class', 'nv-axislabel');
          var w = (scale.range().length==2) ? scale.range()[1] : (scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]));
          axisLabel
              .attr('text-anchor', 'middle')
              .attr('y', xLabelMargin)
              .attr('x', w/2);
          if (showMaxMin) {
          //if (showMaxMin && !isOrdinal) {
            var axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                           //.data(scale.domain())
                           .data([scale.domain()[0], scale.domain()[scale.domain().length - 1]]);
            axisMaxMin.enter().append('g').attr('class', 'nv-axisMaxMin').append('text');
            axisMaxMin.exit().remove();
            axisMaxMin
                .attr('transform', function(d,i) {
                  return 'translate(' + (scale(d) + (isOrdinal ? scale.rangeBand() / 2 : 0)) + ',0)'
                })
              .select('text')
                .attr('dy', '.71em')
                .attr('y', axis.tickPadding())
                .attr('transform', function(d,i,j) { return 'rotate(' + rotateLabels + ' 0,0)' })
                .style('text-anchor', rotateLabels ? (rotateLabels%360 > 0 ? 'start' : 'end') : 'middle')
                .text(function(d,i) {
                  var v = fmt(d);
                  return ('' + v).match('NaN') ? '' : v;
                });
            axisMaxMin.transition()
                .attr('transform', function(d,i) {
                  //return 'translate(' + scale.range()[i] + ',0)'
                  //return 'translate(' + scale(d) + ',0)'
                  return 'translate(' + (scale(d) + (isOrdinal ? scale.rangeBand() / 2 : 0)) + ',0)'
                });
          }
          if (staggerLabels)
            xTicks
                .attr('transform', function(d,i) { return 'translate(0,' + (i % 2 == 0 ? '0' : '12') + ')' });

          break;
        case 'right':
          axisLabel.enter().append('text').attr('class', 'nv-axislabel');
          axisLabel
              .style('text-anchor', rotateYLabel ? 'middle' : 'begin')
              .attr('transform', rotateYLabel ? 'rotate(90)' : '')
              .attr('y', rotateYLabel ? (-Math.max(margin.right,width) + 12) : -10) //TODO: consider calculating this based on largest tick width... OR at least expose this on chart
              .attr('x', rotateYLabel ? (scale.range()[0] / 2) : axis.tickPadding());
          if (showMaxMin) {
            var axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                           .data(scale.domain());
            axisMaxMin.enter().append('g').attr('class', 'nv-axisMaxMin').append('text')
                .style('opacity', 0);
            axisMaxMin.exit().remove();
            axisMaxMin
                .attr('transform', function(d,i) {
                  return 'translate(0,' + scale(d) + ')'
                })
              .select('text')
                .attr('dy', '.32em')
                .attr('y', 0)
                .attr('x', axis.tickPadding())
                .style('text-anchor', 'start')
                .text(function(d,i) {
                  var v = fmt(d);
                  return ('' + v).match('NaN') ? '' : v;
                });
            axisMaxMin.transition()
                .attr('transform', function(d,i) {
                  return 'translate(0,' + scale.range()[i] + ')'
                })
              .select('text')
                .style('opacity', 1);
          }
          break;
        case 'left':
          /*
          //For dynamically placing the label. Can be used with dynamically-sized chart axis margins
          var yTicks = g.selectAll('g').select("text");
          yTicks.each(function(d,i){
            var labelPadding = this.getBBox().width + axis.tickPadding() + 16;
            if(labelPadding > width) width = labelPadding;
          });
          */
          axisLabel.enter().append('text').attr('class', 'nv-axislabel');
          axisLabel
              .style('text-anchor', rotateYLabel ? 'middle' : 'end')
              .attr('transform', rotateYLabel ? 'rotate(-90)' : '')
              .attr('y', rotateYLabel ? (-Math.max(margin.left,width) + 12) : -10) //TODO: consider calculating this based on largest tick width... OR at least expose this on chart
              .attr('x', rotateYLabel ? (-scale.range()[0] / 2) : -axis.tickPadding());
          if (showMaxMin) {
            var axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                           .data(scale.domain());
            axisMaxMin.enter().append('g').attr('class', 'nv-axisMaxMin').append('text')
                .style('opacity', 0);
            axisMaxMin.exit().remove();
            axisMaxMin
                .attr('transform', function(d,i) {
                  return 'translate(0,' + scale0(d) + ')'
                })
              .select('text')
                .attr('dy', '.32em')
                .attr('y', 0)
                .attr('x', -axis.tickPadding())
                .attr('text-anchor', 'end')
                .text(function(d,i) {
                  var v = fmt(d);
                  return ('' + v).match('NaN') ? '' : v;
                });
            axisMaxMin.transition()
                .attr('transform', function(d,i) {
                  return 'translate(0,' + scale.range()[i] + ')'
                })
              .select('text')
                .style('opacity', 1);
          }
          break;
      }
      axisLabel
          .text(function(d) { return d });


      if (showMaxMin && (axis.orient() === 'left' || axis.orient() === 'right')) {
        //check if max and min overlap other values, if so, hide the values that overlap
        g.selectAll('g') // the g's wrapping each tick
            .each(function(d,i) {
              d3.select(this).select('text').attr('opacity', 1);
              if (scale(d) < scale.range()[1] + 10 || scale(d) > scale.range()[0] - 10) { // 10 is assuming text height is 16... if d is 0, leave it!
                if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                  d3.select(this).attr('opacity', 0);
                
                d3.select(this).select('text').attr('opacity', 0); // Don't remove the ZERO line!!
              }
            });

        //if Max and Min = 0 only show min, Issue #281
        if (scale.domain()[0] == scale.domain()[1] && scale.domain()[0] == 0)
          wrap.selectAll('g.nv-axisMaxMin')
            .style('opacity', function(d,i) { return !i ? 1 : 0 });

      }

      if (showMaxMin && (axis.orient() === 'top' || axis.orient() === 'bottom')) {
        var maxMinRange = [];
        wrap.selectAll('g.nv-axisMaxMin')
            .each(function(d,i) {
              try {
                  if (i) // i== 1, max position
                      maxMinRange.push(scale(d) - this.getBBox().width - 4)  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                  else // i==0, min position
                      maxMinRange.push(scale(d) + this.getBBox().width + 4)
              }catch (err) {
                  if (i) // i== 1, max position
                      maxMinRange.push(scale(d) - 4)  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                  else // i==0, min position
                      maxMinRange.push(scale(d) + 4)
              }
            });
        g.selectAll('g') // the g's wrapping each tick
            .each(function(d,i) {
              if (scale(d) < maxMinRange[0] || scale(d) > maxMinRange[1]) {
                if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                  d3.select(this).remove();
                else
                  d3.select(this).select('text').remove(); // Don't remove the ZERO line!!
              }
            });
      }


      //highlight zero line ... Maybe should not be an option and should just be in CSS?
      if (highlightZero)
        g.selectAll('.tick')
          .filter(function(d) { return !parseFloat(Math.round(d.__data__*100000)/1000000) && (d.__data__ !== undefined) }) //this is because sometimes the 0 tick is a very small fraction, TODO: think of cleaner technique
            .classed('zero', true);

      //store old scales for use in transitions on update
      scale0 = scale.copy();

    });

    return chart;
  }


  //============================================================
  // Expose Public Variables
  //------------------------------------------------------------

  // expose chart's sub-components
  chart.axis = axis;

  d3.rebind(chart, axis, 'orient', 'tickValues', 'tickSubdivide', 'tickSize', 'tickPadding', 'tickFormat');
  d3.rebind(chart, scale, 'domain', 'range', 'rangeBand', 'rangeBands'); //these are also accessible by chart.scale(), but added common ones directly for ease of use

  chart.options = nv.utils.optionsFunc.bind(chart);
  
  chart.margin = function(_) {
    if(!arguments.length) return margin;
    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
    return chart;
  }

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.ticks = function(_) {
    if (!arguments.length) return ticks;
    ticks = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.axisLabel = function(_) {
    if (!arguments.length) return axisLabelText;
    axisLabelText = _;
    return chart;
  }

  chart.showMaxMin = function(_) {
    if (!arguments.length) return showMaxMin;
    showMaxMin = _;
    return chart;
  }

  chart.highlightZero = function(_) {
    if (!arguments.length) return highlightZero;
    highlightZero = _;
    return chart;
  }

  chart.scale = function(_) {
    if (!arguments.length) return scale;
    scale = _;
    axis.scale(scale);
    isOrdinal = typeof scale.rangeBands === 'function';
    d3.rebind(chart, scale, 'domain', 'range', 'rangeBand', 'rangeBands');
    return chart;
  }

  chart.rotateYLabel = function(_) {
    if(!arguments.length) return rotateYLabel;
    rotateYLabel = _;
    return chart;
  }

  chart.rotateLabels = function(_) {
    if(!arguments.length) return rotateLabels;
    rotateLabels = _;
    return chart;
  }

  chart.staggerLabels = function(_) {
    if (!arguments.length) return staggerLabels;
    staggerLabels = _;
    return chart;
  };

  //============================================================


  return chart;
}
nv.models.legend = function() {
  "use strict";
  //============================================================
  // Public Variables with Default Settings
  //------------------------------------------------------------

  var margin = {top: 5, right: 0, bottom: 5, left: 0}
    , width = 400
    , height = 20
    , getKey = function(d) { return d.key }
    , color = nv.utils.defaultColor()
    , align = true
    , rightAlign = true
    , updateState = true   //If true, legend will update data.disabled and trigger a 'stateChange' dispatch.
    , radioButtonMode = false   //If true, clicking legend items will cause it to behave like a radio button. (only one can be selected at a time)
    , dispatch = d3.dispatch('legendClick', 'legendDblclick', 'legendMouseover', 'legendMouseout', 'stateChange')
    ;

  //============================================================


  function chart(selection) {
    selection.each(function(data) {
      var availableWidth = width - margin.left - margin.right,
          container = d3.select(this);


      //------------------------------------------------------------
      // Setup containers and skeleton of chart

      var wrap = container.selectAll('g.nv-legend').data([data]);
      var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-legend').append('g');
      var g = wrap.select('g');

      wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      //------------------------------------------------------------


      var series = g.selectAll('.nv-series')
          .data(function(d) { return d });
      var seriesEnter = series.enter().append('g').attr('class', 'nv-series')
          .on('mouseover', function(d,i) {
            dispatch.legendMouseover(d,i);  //TODO: Make consistent with other event objects
          })
          .on('mouseout', function(d,i) {
            dispatch.legendMouseout(d,i);
          })
          .on('click', function(d,i) {
            dispatch.legendClick(d,i);
            if (updateState) {
               if (radioButtonMode) {
                   //Radio button mode: set every series to disabled,
                   //  and enable the clicked series.
                   data.forEach(function(series) { series.disabled = true});
                   d.disabled = false;
               }
               else {
                   d.disabled = !d.disabled;
                   if (data.every(function(series) { return series.disabled})) {
                       //the default behavior of NVD3 legends is, if every single series
                       // is disabled, turn all series' back on.
                       data.forEach(function(series) { series.disabled = false});
                   }
               }
               dispatch.stateChange({
                  disabled: data.map(function(d) { return !!d.disabled })
               });
            }
          })
          .on('dblclick', function(d,i) {
            dispatch.legendDblclick(d,i);
            if (updateState) {
                //the default behavior of NVD3 legends, when double clicking one,
                // is to set all other series' to false, and make the double clicked series enabled.
                data.forEach(function(series) {
                   series.disabled = true;
                });
                d.disabled = false; 
                dispatch.stateChange({
                    disabled: data.map(function(d) { return !!d.disabled })
                });
            }
          });
      seriesEnter.append('circle')
          .style('stroke-width', 2)
          .attr('class','nv-legend-symbol')
          .attr('r', 5);
      seriesEnter.append('text')
          .attr('text-anchor', 'start')
          .attr('class','nv-legend-text')
          .attr('dy', '.32em')
          .attr('dx', '8');
      series.classed('disabled', function(d) { return d.disabled });
      series.exit().remove();
      series.select('circle')
          .style('fill', function(d,i) { return d.color || color(d,i)})
          .style('stroke', function(d,i) { return d.color || color(d, i) });
      series.select('text').text(getKey);


      //TODO: implement fixed-width and max-width options (max-width is especially useful with the align option)

      // NEW ALIGNING CODE, TODO: clean up
      if (align) {

        var seriesWidths = [];
        series.each(function(d,i) {
              var legendText = d3.select(this).select('text');
              var nodeTextLength;
              try {
                nodeTextLength = legendText.node().getComputedTextLength();
              }
              catch(e) {
                nodeTextLength = nv.utils.calcApproxTextWidth(legendText);
              }
             
              seriesWidths.push(nodeTextLength + 28); // 28 is ~ the width of the circle plus some padding
            });

        var seriesPerRow = 0;
        var legendWidth = 0;
        var columnWidths = [];

        while ( legendWidth < availableWidth && seriesPerRow < seriesWidths.length) {
          columnWidths[seriesPerRow] = seriesWidths[seriesPerRow];
          legendWidth += seriesWidths[seriesPerRow++];
        }
        if (seriesPerRow === 0) seriesPerRow = 1; //minimum of one series per row


        while ( legendWidth > availableWidth && seriesPerRow > 1 ) {
          columnWidths = [];
          seriesPerRow--;

          for (var k = 0; k < seriesWidths.length; k++) {
            if (seriesWidths[k] > (columnWidths[k % seriesPerRow] || 0) )
              columnWidths[k % seriesPerRow] = seriesWidths[k];
          }

          legendWidth = columnWidths.reduce(function(prev, cur, index, array) {
                          return prev + cur;
                        });
        }

        var xPositions = [];
        for (var i = 0, curX = 0; i < seriesPerRow; i++) {
            xPositions[i] = curX;
            curX += columnWidths[i];
        }

        series
            .attr('transform', function(d, i) {
              return 'translate(' + xPositions[i % seriesPerRow] + ',' + (5 + Math.floor(i / seriesPerRow) * 20) + ')';
            });

        //position legend as far right as possible within the total width
        if (rightAlign) {
           g.attr('transform', 'translate(' + (width - margin.right - legendWidth) + ',' + margin.top + ')');
        }
        else {
           g.attr('transform', 'translate(0' + ',' + margin.top + ')');
        }

        height = margin.top + margin.bottom + (Math.ceil(seriesWidths.length / seriesPerRow) * 20);

      } else {

        var ypos = 5,
            newxpos = 5,
            maxwidth = 0,
            xpos;
        series
            .attr('transform', function(d, i) {
              var length = d3.select(this).select('text').node().getComputedTextLength() + 28;
              xpos = newxpos;

              if (width < margin.left + margin.right + xpos + length) {
                newxpos = xpos = 5;
                ypos += 20;
              }

              newxpos += length;
              if (newxpos > maxwidth) maxwidth = newxpos;

              return 'translate(' + xpos + ',' + ypos + ')';
            });

        //position legend as far right as possible within the total width
        g.attr('transform', 'translate(' + (width - margin.right - maxwidth) + ',' + margin.top + ')');

        height = margin.top + margin.bottom + ypos + 15;

      }

    });

    return chart;
  }


  //============================================================
  // Expose Public Variables
  //------------------------------------------------------------

  chart.dispatch = dispatch;
  chart.options = nv.utils.optionsFunc.bind(chart);
  
  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
    return chart;
  };

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.key = function(_) {
    if (!arguments.length) return getKey;
    getKey = _;
    return chart;
  };

  chart.color = function(_) {
    if (!arguments.length) return color;
    color = nv.utils.getColor(_);
    return chart;
  };

  chart.align = function(_) {
    if (!arguments.length) return align;
    align = _;
    return chart;
  };

  chart.rightAlign = function(_) {
    if (!arguments.length) return rightAlign;
    rightAlign = _;
    return chart;
  };

  chart.updateState = function(_) {
    if (!arguments.length) return updateState;
    updateState = _;
    return chart;
  };

  chart.radioButtonMode = function(_) {
    if (!arguments.length) return radioButtonMode;
    radioButtonMode = _;
    return chart;
  };

  //============================================================


  return chart;
}

nv.models.line = function() {
  "use strict";
  //============================================================
  // Public Variables with Default Settings
  //------------------------------------------------------------

  var  scatter = nv.models.scatter()
    ;

  var margin = {top: 0, right: 0, bottom: 0, left: 0}
    , width = 960
    , height = 500
    , color = nv.utils.defaultColor() // a function that returns a color
    , getX = function(d) { return d.x } // accessor to get the x value from a data point
    , getY = function(d) { return d.y } // accessor to get the y value from a data point
    , defined = function(d,i) { return !isNaN(getY(d,i)) && getY(d,i) !== null } // allows a line to be not continuous when it is not defined
    , isArea = function(d) { return d.area } // decides if a line is an area or just a line
    , clipEdge = false // if true, masks lines within x and y scale
    , x //can be accessed via chart.xScale()
    , y //can be accessed via chart.yScale()
    , interpolate = "linear" // controls the line interpolation
    ;

  scatter
    .size(16) // default size
    .sizeDomain([16,256]) //set to speed up calculation, needs to be unset if there is a custom size accessor
    ;
    
  //============================================================


  //============================================================
  // Private Variables
  //------------------------------------------------------------

  var x0, y0 //used to store previous scales
      ;

  //============================================================


  function chart(selection) {
    selection.each(function(data) {
      var availableWidth = width - margin.left - margin.right,
          availableHeight = height - margin.top - margin.bottom,
          container = d3.select(this);

      //------------------------------------------------------------
      // Setup Scales

      x = scatter.xScale();
      y = scatter.yScale();

      x0 = x0 || x;
      y0 = y0 || y;

      //------------------------------------------------------------


      //------------------------------------------------------------
      // Setup containers and skeleton of chart

      var wrap = container.selectAll('g.nv-wrap.nv-line').data([data]);
      var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-line');
      var defsEnter = wrapEnter.append('defs');
      var gEnter = wrapEnter.append('g');
      var g = wrap.select('g')

      gEnter.append('g').attr('class', 'nv-groups');
      gEnter.append('g').attr('class', 'nv-scatterWrap');

      wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      //------------------------------------------------------------




      scatter
        .width(availableWidth)
        .height(availableHeight)

      var scatterWrap = wrap.select('.nv-scatterWrap');
          //.datum(data); // Data automatically trickles down from the wrap

      scatterWrap.transition().call(scatter);



      defsEnter.append('clipPath')
          .attr('id', 'nv-edge-clip-' + scatter.id())
        .append('rect');

      wrap.select('#nv-edge-clip-' + scatter.id() + ' rect')
          .attr('width', availableWidth)
          .attr('height', availableHeight);

      g   .attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + scatter.id() + ')' : '');
      scatterWrap
          .attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + scatter.id() + ')' : '');




      var groups = wrap.select('.nv-groups').selectAll('.nv-group')
          .data(function(d) { return d }, function(d) { return d.key });
      groups.enter().append('g')
          .style('stroke-opacity', 1e-6)
          .style('fill-opacity', 1e-6);
      groups.exit()
          .transition()
          .style('stroke-opacity', 1e-6)
          .style('fill-opacity', 1e-6)
          .remove();
      groups
          .attr('class', function(d,i) { return 'nv-group nv-series-' + i })
          .classed('hover', function(d) { return d.hover })
          .style('fill', function(d,i){ return color(d, i) })
          .style('stroke', function(d,i){ return color(d, i)});
      groups
          .transition()
          .style('stroke-opacity', 1)
          .style('fill-opacity', .5);



      var areaPaths = groups.selectAll('path.nv-area')
          .data(function(d) { return isArea(d) ? [d] : [] }); // this is done differently than lines because I need to check if series is an area
      areaPaths.enter().append('path')
          .attr('class', 'nv-area')
          .attr('d', function(d) {
            return d3.svg.area()
                .interpolate(interpolate)
                .defined(defined)
                .x(function(d,i) { return nv.utils.NaNtoZero(x0(getX(d,i))) })
                .y0(function(d,i) { return nv.utils.NaNtoZero(y0(getY(d,i))) })
                .y1(function(d,i) { return y0( y.domain()[0] <= 0 ? y.domain()[1] >= 0 ? 0 : y.domain()[1] : y.domain()[0] ) })
                //.y1(function(d,i) { return y0(0) }) //assuming 0 is within y domain.. may need to tweak this
                .apply(this, [d.values])
          });
      groups.exit().selectAll('path.nv-area')
           .remove();
           
      areaPaths
          .transition()
          .attr('d', function(d) {
            return d3.svg.area()
                .interpolate(interpolate)
                .defined(defined)
                .x(function(d,i) { return nv.utils.NaNtoZero(x(getX(d,i))) })
                .y0(function(d,i) { return nv.utils.NaNtoZero(y(getY(d,i))) })
                .y1(function(d,i) { return y( y.domain()[0] <= 0 ? y.domain()[1] >= 0 ? 0 : y.domain()[1] : y.domain()[0] ) })
                //.y1(function(d,i) { return y0(0) }) //assuming 0 is within y domain.. may need to tweak this
                .apply(this, [d.values])
          });



      var linePaths = groups.selectAll('path.nv-line')
          .data(function(d) { return [d.values] });
      linePaths.enter().append('path')
          .attr('class', 'nv-line')
          .attr('d',
            d3.svg.line()
              .interpolate(interpolate)
              .defined(defined)
              .x(function(d,i) { return nv.utils.NaNtoZero(x0(getX(d,i))) })
              .y(function(d,i) { return nv.utils.NaNtoZero(y0(getY(d,i))) })
          );
      groups.exit().selectAll('path.nv-line')
          .transition()
          .attr('d',
            d3.svg.line()
              .interpolate(interpolate)
              .defined(defined)
              .x(function(d,i) { return nv.utils.NaNtoZero(x(getX(d,i))) })
              .y(function(d,i) { return nv.utils.NaNtoZero(y(getY(d,i))) })
          );
      linePaths
          .transition()
          .attr('d',
            d3.svg.line()
              .interpolate(interpolate)
              .defined(defined)
              .x(function(d,i) { return nv.utils.NaNtoZero(x(getX(d,i))) })
              .y(function(d,i) { return nv.utils.NaNtoZero(y(getY(d,i))) })
          );



      //store old scales for use in transitions on update
      x0 = x.copy();
      y0 = y.copy();

    });

    return chart;
  }


  //============================================================
  // Expose Public Variables
  //------------------------------------------------------------

  chart.dispatch = scatter.dispatch;
  chart.scatter = scatter;

  d3.rebind(chart, scatter, 'id', 'interactive', 'size', 'xScale', 'yScale', 'zScale', 'xDomain', 'yDomain', 'xRange', 'yRange', 
    'sizeDomain', 'forceX', 'forceY', 'forceSize', 'clipVoronoi', 'useVoronoi', 'clipRadius', 'padData','highlightPoint','clearHighlights');

  chart.options = nv.utils.optionsFunc.bind(chart);
  
  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
    return chart;
  };

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.x = function(_) {
    if (!arguments.length) return getX;
    getX = _;
    scatter.x(_);
    return chart;
  };

  chart.y = function(_) {
    if (!arguments.length) return getY;
    getY = _;
    scatter.y(_);
    return chart;
  };

  chart.clipEdge = function(_) {
    if (!arguments.length) return clipEdge;
    clipEdge = _;
    return chart;
  };

  chart.color = function(_) {
    if (!arguments.length) return color;
    color = nv.utils.getColor(_);
    scatter.color(color);
    return chart;
  };

  chart.interpolate = function(_) {
    if (!arguments.length) return interpolate;
    interpolate = _;
    return chart;
  };

  chart.defined = function(_) {
    if (!arguments.length) return defined;
    defined = _;
    return chart;
  };

  chart.isArea = function(_) {
    if (!arguments.length) return isArea;
    isArea = d3.functor(_);
    return chart;
  };

  //============================================================


  return chart;
}

nv.models.lineChart = function() {
  "use strict";
  //============================================================
  // Public Variables with Default Settings
  //------------------------------------------------------------

  var lines = nv.models.line()
    , xAxis = nv.models.axis()
    , yAxis = nv.models.axis()
    , legend = nv.models.legend()
    , interactiveLayer = nv.interactiveGuideline()
    ;

  var margin = {top: 30, right: 20, bottom: 50, left: 60}
    , color = nv.utils.defaultColor()
    , width = null
    , height = null
    , showLegend = true
    , showXAxis = true
    , showYAxis = true
    , rightAlignYAxis = false
    , useInteractiveGuideline = false
    , tooltips = true
    , tooltip = function(key, x, y, e, graph) {
        return '<h3>' + key + '</h3>' +
               '<p>' +  y + ' at ' + x + '</p>'
      }
    , x
    , y
    , state = {}
    , defaultState = null
    , noData = 'No Data Available.'
    , dispatch = d3.dispatch('tooltipShow', 'tooltipHide', 'stateChange', 'changeState')
    , transitionDuration = 250
    ;

  xAxis
    .orient('bottom')
    .tickPadding(7)
    ;
  yAxis
    .orient((rightAlignYAxis) ? 'right' : 'left')
    ;

  //============================================================


  //============================================================
  // Private Variables
  //------------------------------------------------------------

  var showTooltip = function(e, offsetElement) {
    var left = e.pos[0] + ( offsetElement.offsetLeft || 0 ),
        top = e.pos[1] + ( offsetElement.offsetTop || 0),
        x = xAxis.tickFormat()(lines.x()(e.point, e.pointIndex)),
        y = yAxis.tickFormat()(lines.y()(e.point, e.pointIndex)),
        content = tooltip(e.series.key, x, y, e, chart);

    nv.tooltip.show([left, top], content, null, null, offsetElement);
  };

  //============================================================


  function chart(selection) {
    selection.each(function(data) {
      var container = d3.select(this),
          that = this;

      var availableWidth = (width  || parseInt(container.style('width')) || 960)
                             - margin.left - margin.right,
          availableHeight = (height || parseInt(container.style('height')) || 400)
                             - margin.top - margin.bottom;


      chart.update = function() { container.transition().duration(transitionDuration).call(chart) };
      chart.container = this;

      //set state.disabled
      state.disabled = data.map(function(d) { return !!d.disabled });

    
      if (!defaultState) {
        var key;
        defaultState = {};
        for (key in state) {
          if (state[key] instanceof Array)
            defaultState[key] = state[key].slice(0);
          else
            defaultState[key] = state[key];
        }
      }

      //------------------------------------------------------------
      // Display noData message if there's nothing to show.

      if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
        var noDataText = container.selectAll('.nv-noData').data([noData]);

        noDataText.enter().append('text')
          .attr('class', 'nvd3 nv-noData')
          .attr('dy', '-.7em')
          .style('text-anchor', 'middle');

        noDataText
          .attr('x', margin.left + availableWidth / 2)
          .attr('y', margin.top + availableHeight / 2)
          .text(function(d) { return d });

        return chart;
      } else {
        container.selectAll('.nv-noData').remove();
      }

      //------------------------------------------------------------


      //------------------------------------------------------------
      // Setup Scales

      x = lines.xScale();
      y = lines.yScale();

      //------------------------------------------------------------


      //------------------------------------------------------------
      // Setup containers and skeleton of chart

      var wrap = container.selectAll('g.nv-wrap.nv-lineChart').data([data]);
      var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-lineChart').append('g');
      var g = wrap.select('g');

      gEnter.append("rect").style("opacity",0);
      gEnter.append('g').attr('class', 'nv-x nv-axis');
      gEnter.append('g').attr('class', 'nv-y nv-axis');
      gEnter.append('g').attr('class', 'nv-linesWrap');
      gEnter.append('g').attr('class', 'nv-legendWrap');
      gEnter.append('g').attr('class', 'nv-interactive');

      g.select("rect").attr("width",availableWidth).attr("height",availableHeight);
      //------------------------------------------------------------
      // Legend

      if (showLegend) {
        legend.width(availableWidth);

        g.select('.nv-legendWrap')
            .datum(data)
            .call(legend);

        if ( margin.top != legend.height()) {
          margin.top = legend.height();
          availableHeight = (height || parseInt(container.style('height')) || 400)
                             - margin.top - margin.bottom;
        }

        wrap.select('.nv-legendWrap')
            .attr('transform', 'translate(0,' + (-margin.top) +')')
      }

      //------------------------------------------------------------

      wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      if (rightAlignYAxis) {
          g.select(".nv-y.nv-axis")
              .attr("transform", "translate(" + availableWidth + ",0)");
      }

      //------------------------------------------------------------
      // Main Chart Component(s)

      
      //------------------------------------------------------------
      //Set up interactive layer
      if (useInteractiveGuideline) {
        interactiveLayer
           .width(availableWidth)
           .height(availableHeight)
           .margin({left:margin.left, top:margin.top})
           .svgContainer(container)
           .xScale(x);
        wrap.select(".nv-interactive").call(interactiveLayer);
      }


      lines
        .width(availableWidth)
        .height(availableHeight)
        .color(data.map(function(d,i) {
          return d.color || color(d, i);
        }).filter(function(d,i) { return !data[i].disabled }));


      var linesWrap = g.select('.nv-linesWrap')
          .datum(data.filter(function(d) { return !d.disabled }))

      linesWrap.transition().call(lines);

      //------------------------------------------------------------


      //------------------------------------------------------------
      // Setup Axes

      if (showXAxis) {
        xAxis
          .scale(x)
          .ticks( availableWidth / 100 )
          .tickSize(-availableHeight, 0);

        g.select('.nv-x.nv-axis')
            .attr('transform', 'translate(0,' + y.range()[0] + ')');
        g.select('.nv-x.nv-axis')
            .transition()
            .call(xAxis);
      }

      if (showYAxis) {
        yAxis
          .scale(y)
          .ticks( availableHeight / 36 )
          .tickSize( -availableWidth, 0);

        g.select('.nv-y.nv-axis')
            .transition()
            .call(yAxis);
      }
      //------------------------------------------------------------


      //============================================================
      // Event Handling/Dispatching (in chart's scope)
      //------------------------------------------------------------

      legend.dispatch.on('stateChange', function(newState) {
          state = newState;
          dispatch.stateChange(state);
          chart.update();
      });

      interactiveLayer.dispatch.on('elementMousemove', function(e) {
          lines.clearHighlights();
          var singlePoint, pointIndex, pointXLocation, allData = [];
          data
          .filter(function(series, i) { 
            series.seriesIndex = i;
            return !series.disabled; 
          })
          .forEach(function(series,i) {
              pointIndex = nv.interactiveBisect(series.values, e.pointXValue, chart.x());
              lines.highlightPoint(i, pointIndex, true);
              var point = series.values[pointIndex];
              if (typeof point === 'undefined') return;
              if (typeof singlePoint === 'undefined') singlePoint = point;
              if (typeof pointXLocation === 'undefined') pointXLocation = chart.xScale()(chart.x()(point,pointIndex));
              allData.push({
                  key: series.key,
                  value: chart.y()(point, pointIndex),
                  color: color(series,series.seriesIndex)
              });
          });

          var xValue = xAxis.tickFormat()(chart.x()(singlePoint,pointIndex));
          interactiveLayer.tooltip
                  .position({left: pointXLocation + margin.left, top: e.mouseY + margin.top})
                  .chartContainer(that.parentNode)
                  .enabled(tooltips)
                  .valueFormatter(function(d,i) {
                     return yAxis.tickFormat()(d);
                  })
                  .data(
                      {
                        value: xValue,
                        series: allData
                      }
                  )();

          interactiveLayer.renderGuideLine(pointXLocation);

      });

      interactiveLayer.dispatch.on("elementMouseout",function(e) {
          dispatch.tooltipHide();
          lines.clearHighlights();
      });

      dispatch.on('tooltipShow', function(e) {
        if (tooltips) showTooltip(e, that.parentNode);
      });


      dispatch.on('changeState', function(e) {

        if (typeof e.disabled !== 'undefined') {
          data.forEach(function(series,i) {
            series.disabled = e.disabled[i];
          });

          state.disabled = e.disabled;
        }

        chart.update();
      });

      //============================================================

    });

    return chart;
  }


  //============================================================
  // Event Handling/Dispatching (out of chart's scope)
  //------------------------------------------------------------

  lines.dispatch.on('elementMouseover.tooltip', function(e) {
    e.pos = [e.pos[0] +  margin.left, e.pos[1] + margin.top];
    dispatch.tooltipShow(e);
  });

  lines.dispatch.on('elementMouseout.tooltip', function(e) {
    dispatch.tooltipHide(e);
  });

  dispatch.on('tooltipHide', function() {
    if (tooltips) nv.tooltip.cleanup();
  });

  //============================================================


  //============================================================
  // Expose Public Variables
  //------------------------------------------------------------

  // expose chart's sub-components
  chart.dispatch = dispatch;
  chart.lines = lines;
  chart.legend = legend;
  chart.xAxis = xAxis;
  chart.yAxis = yAxis;
  chart.interactiveLayer = interactiveLayer;

  d3.rebind(chart, lines, 'defined', 'isArea', 'x', 'y', 'size', 'xScale', 'yScale', 'xDomain', 'yDomain', 'xRange', 'yRange'
    , 'forceX', 'forceY', 'interactive', 'clipEdge', 'clipVoronoi', 'useVoronoi','id', 'interpolate');

  chart.options = nv.utils.optionsFunc.bind(chart);

  chart.margin = function(_) {
    if (!arguments.length) return margin;
    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
    return chart;
  };

  chart.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function(_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.color = function(_) {
    if (!arguments.length) return color;
    color = nv.utils.getColor(_);
    legend.color(color);
    return chart;
  };

  chart.showLegend = function(_) {
    if (!arguments.length) return showLegend;
    showLegend = _;
    return chart;
  };

  chart.showXAxis = function(_) {
    if (!arguments.length) return showXAxis;
    showXAxis = _;
    return chart;
  };

  chart.showYAxis = function(_) {
    if (!arguments.length) return showYAxis;
    showYAxis = _;
    return chart;
  };

  chart.rightAlignYAxis = function(_) {
    if(!arguments.length) return rightAlignYAxis;
    rightAlignYAxis = _;
    yAxis.orient( (_) ? 'right' : 'left');
    return chart;
  };

  chart.useInteractiveGuideline = function(_) {
    if(!arguments.length) return useInteractiveGuideline;
    useInteractiveGuideline = _;
    if (_ === true) {
       chart.interactive(false);
       chart.useVoronoi(false);
    }
    return chart;
  };

  chart.tooltips = function(_) {
    if (!arguments.length) return tooltips;
    tooltips = _;
    return chart;
  };

  chart.tooltipContent = function(_) {
    if (!arguments.length) return tooltip;
    tooltip = _;
    return chart;
  };

  chart.state = function(_) {
    if (!arguments.length) return state;
    state = _;
    return chart;
  };

  chart.defaultState = function(_) {
    if (!arguments.length) return defaultState;
    defaultState = _;
    return chart;
  };

  chart.noData = function(_) {
    if (!arguments.length) return noData;
    noData = _;
    return chart;
  };

  chart.transitionDuration = function(_) {
    if (!arguments.length) return transitionDuration;
    transitionDuration = _;
    return chart;
  };

  //============================================================


  return chart;
}
})();