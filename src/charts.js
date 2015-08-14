/*!
 * OMHVisualization.Charts
 * Released under the apache 2.0 license
 */
( function( root, factory ) {
  var parentName = 'OMHWebVisualizations';
  root[ parentName ] = factory( root, parentName );
}( this, function( root, parentName ) {
  var parent = root.hasOwnProperty( parentName )? root[ parentName ] : {};
  parent.Chart = function( data, element, measureList, options ){

    var MS_PER_DAY = 86400000;
    var POINT_OPACITY = 0.5;
    var LINE_STROKE_WIDTH = '1px';
    var POINT_STROKE_WIDTH = '1px';

    var selection = d3.select( element.find('svg')[0] );

    var measureData = {};
    var measures = measureList.split(/\s*,\s*/);

    var tooltipHoverPointEntities = {};
    var entityHoverGroups = {};

    var chart = null;

    var defaultSettings = {
      'userInterface': {
        'toolbar': { 'enabled': true },
        'timespanButtons': { 'enabled': true },
        'zoomButtons': { 'enabled': true },
        'navigation': { 'enabled': true },
        'tooltips': {
          'enabled': true,
          'timeFormat': 'M/D/YY, h:mma'
         },
        'panZoom': {
          'enabled': true,
          'showHint': true
        },
      },
      'measures': {
        'body_weight' : {
          'valueKeyPath': 'body.body_weight.value',
          'range': { 'min':0, 'max':100 },
          'units': 'kg',
          'thresholds': { 'max':57 },
        },
        'heart_rate': {
          'valueKeyPath': 'body.heart_rate.value',
          'range': { 'min':30, 'max':150 },
          'units': 'bpm',
        },
        'step_count': {
          'valueKeyPath': 'body.step_count',
          'range': { 'min':0, 'max':1500 },
          'units': 'Steps',
          'seriesName': 'Steps',
          'chart': {
            'type':'clustered_bar',
            'barColor' : '#eeeeee',
            'daysShownOnTimeline': { 'min':7, 'max':90 },
          },
        },
        'minutes_moderate_activity': {
          'valueKeyPath': 'body.minutes_moderate_activity.value',
          'range': { 'min':0, 'max':300 },
          'units': 'Minutes',
          'seriesName': 'Minutes of moderate activity',
          'chart': {
            'type':'clustered_bar',
            'daysShownOnTimeline': { 'min':7, 'max':90 },
          },
        },
        'systolic_blood_pressure': {
          'valueKeyPath': 'body.systolic_blood_pressure.value',
          'range': { 'min':30, 'max':200 },
          'units': 'mmHg',
          'thresholds':  { 'max':120 },
        },
        'diastolic_blood_pressure': {
          'valueKeyPath': 'body.diastolic_blood_pressure.value',
          'range': { 'min':30, 'max':200 },
          'units': 'mmHg',
          'thresholds':  { 'max':80 },
        }
      }
    };

    var genericMeasureDefaults = {
      'range': { 'min':0, 'max':100 },
      'units': 'Units',
      'seriesName': 'Series',
      'chart': {
        'type':'line',
        'pointSize': 9,
        'lineColor' : '#dedede',
        'pointFillColor' : '#4a90e2',
        'pointStrokeColor' : '#0066d6',
        'aboveThesholdPointFillColor' : '#e8ac4e',
        'aboveThesholdPointStrokeColor' : '#745628',
        'barColor' : '#4a90e2',
        'daysShownOnTimeline': { 'min':1, 'max':1000 },
      },
    };

    //public method for getting the plottable chart component
    this.getChartComponent = function(){
      return chart;
    };
    //public method for getting the d3 selection
    this.getD3Selection = function(){
      return selection;
    };

    // Merge defaults and options into settings
    var settings = $.extend( true, {}, defaultSettings, options );
    $.each( Object.keys( settings.measures ), function( index, measure ) {
      settings.measures[ measure ] = $.extend( true, {}, genericMeasureDefaults, settings.measures[ measure ] );
    });

    var interfaceSettings = settings.userInterface;

    var getMeasureSettings = function( measure ){
      return settings.measures[ measure ];
    };

    var resolveKeyPath = function( obj, keyPath ){
      var r = keyPath.split('.');
      if( keyPath && r.length>0 ){ return resolveKeyPath( obj[ r.shift() ], r.join('.') ); }
      return obj;
    };

    //parse out the data
    $.each( data, function( key, val ) {
      $.each( measures, function( i, measure ){
        if ( !measureData.hasOwnProperty( measure ) ){
          measureData[ measure ] = [];
        }
        if ( val.body.hasOwnProperty( measure ) ){
          //concatenate a string that represents the body for grouping
          var groupName = val.omhChartGroupName? val.omhChartGroupName : '';
          //if this datum is the first in its group, it is where the tooltip shows
          var hasTooltip = !groupName;
          if ( !groupName ){
            //if one of the measures in our chart is in this group,
            //add it to the group name. because the concatenation
            //order is defined by the measure list string, even if the
            //measures in data bodies are unordered, the same name
            //will be produced
            $.each( measures, function( j, checkMeasure ) {
              if( val.body.hasOwnProperty( checkMeasure ) ) {
                groupName += '_'+checkMeasure;
              }
            });
            val.omhChartGroupName = groupName;
          }
          //prepare the time (x value) at which the point will be plotted
          var time;
          if( val.body['effective_time_frame']['date_time'] ){
            time = new Date( val.body['effective_time_frame']['date_time'] );
          }
          if( val.body['effective_time_frame']['time_interval'] ){
            
            var interval = val.body['effective_time_frame']['time_interval'];
            var startTime = interval['start_date_time'] ? ( new Date( interval['start_date_time'] ) ).getTime() : null;
            var endTime = interval['end_date_time'] ? ( new Date( interval['end_date_time'] ) ).getTime() : null;
            var startTimeMoment = interval['start_date_time'] ? ( moment( interval['start_date_time'] ) ) : null;
            var endTimeMoment = interval['end_date_time'] ? ( moment( interval['end_date_time'] ) ) : null;
            //days, weeks, months, and years could all be different durations depending on
            //the timeframe, because of month duration differences, daylight savings, leapyear, etc
            var durations = {
              "ps":   0.000000001,
              "ns":   0.000001,
              "us":   0.001,
              "ms":   1,
              "sec":  1000,
              "min":  60*1000,
              "h":    60*60*1000,
              "d":    'd',
              "wk":   'w',
              "Mo":   'M',
              "yr":   'y'
            };
            var unit  = interval['duration']['unit'];
            var duration = interval['duration']['value'];
            var durationMs;
            var durationUnitLength = durations[ unit ];
            if ( typeof durationUnitLength !== 'string'){
              durationMs = duration * durationUnitLength;
              if ( ! startTime ){ startTime = endTime - duration; }
              if ( ! endTime ){ endTime = startTime + duration; }
            } else {
              if ( ! startTime ){ startTime = endTimeMoment.subtract( duration, durations[ unit ] ).valueOf(); }
              if ( ! endTime ){ endTime = startTimeMoment.add( duration, durations[ unit ] ).valueOf(); }
              durationMs = endTime - startTime;
            }
            
            var startDate = new Date( startTime );
            //quantize the points by day
            time = new Date( startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0 );

          }
          var valueKeyPath = getMeasureSettings( measure ).valueKeyPath;
          var yValue = resolveKeyPath( val, valueKeyPath );
          measureData[ measure ].push( {
            //for the three measures supported by this code, the value of the reading is stored
            //in the 'value' field of a unit-value object keyed by the measure name
            'y': yValue,
            'x': time,
            'provider': val.header.acquisition_provenance.source_name,
            'body': val.body,
            'groupName': groupName,
            'hasTooltip': hasTooltip,
            'measure': measure
          });
        }
      });
    });

    //consolidate data points at the same time coordinates, as needed
    //provenance data for the first (chronologically) will be preserved
    var consolidateData = function( data ){
      data.sort( function( a, b ){ return a.x.getTime() - b.x.getTime(); } );
      for ( var i=0; i<data.length; i++ ) {
        while( i+1 < data.length && ( data[ i+1 ].x.getTime() === data[ i ].x.getTime() ) ) {
          data[ i ].y += data[ i+1 ].y;
          if ( ! data[ i ].accumulatedDataBodies ){
            data[ i ].accumulatedDataBodies = [ data[ i ].body ];
          }
          data[ i ].accumulatedDataBodies.push( data[ i+1 ].body );
          data.splice( i+1, 1 );
        }
      }
    };

    if ( measureData[ 'minutes_moderate_activity' ] ) {
      consolidateData( measureData[ 'minutes_moderate_activity' ] );
    }
    if ( measureData[ 'step_count' ] ) {
      consolidateData( measureData[ 'step_count' ] );
    }

    var primaryMeasureSettings = getMeasureSettings( measures[0] );

    // set up axes
    var xScale = new Plottable.Scales.Time();
    var yScale = new Plottable.Scales.Linear();
    var domain = primaryMeasureSettings.range;
    yScale.domainMin( domain.min ).domainMax( domain.max );

    var xAxis = new Plottable.Axes.Time( xScale, 'bottom')
    .margin(15)
    .addClass('x-axis');

    var yAxis = new Plottable.Axes.Numeric( yScale, 'left');

    var yLabel = new Plottable.Components.AxisLabel( primaryMeasureSettings.units, '0')
    .padding(5)
    .xAlignment('right')
    .yAlignment('top');

    //make the tooltip follow the plot on pan...
    var drag = new Plottable.Interactions.Drag();
    drag.onDrag( function(){
        hidePanZoomHint && hidePanZoomHint();
        showHoverPointTooltip && showHoverPointTooltip();
      }
    );

    //...and on zoom
    var mouseWheelDispatcher = new Plottable.Dispatchers.Mouse( selection[0][0] )
    .onWheel( function(){
        showHoverPointTooltip && showHoverPointTooltip();
        clearZoomLevelButtonActiveStates && clearZoomLevelButtonActiveStates();
        hidePanZoomHint && hidePanZoomHint();
      }
    );

    //create a plot with hover states for each data set
    var plots = [];
    var destroyers = [];

    //fill and stroke colors are determined by threshold
    var aboveThreshold = function( d ){
      var thresholds = getMeasureSettings( d.measure ).thresholds;
      return thresholds && d.y > thresholds.max;
    };
    var fillColor = function( d ){
      var chartSettings = getMeasureSettings( d.measure ).chart;
      return aboveThreshold( d ) ? chartSettings.aboveThesholdPointFillColor : chartSettings.pointFillColor;
    };
    var strokeColor = function( d ){
      var chartSettings = getMeasureSettings( d.measure ).chart;
      return aboveThreshold( d ) ? chartSettings.aboveThesholdPointStrokeColor : chartSettings.pointStrokeColor;
    };
    var barColor = function( d ){
      return getMeasureSettings( d.measure ).chart.barColor;
    };

    //set up points
    var pointPlot = new Plottable.Plots.Scatter()
    .x( function(d) { return d.x; }, xScale )
    .y( function(d) { return d.y; }, yScale )
    .size( function(d) { return getMeasureSettings( d.measure ).chart.pointSize; } )
    .attr('fill', function( d ){
      return fillColor( d );
    } )
    .attr('opacity', POINT_OPACITY )
    .attr('stroke-width', POINT_STROKE_WIDTH )
    .attr('stroke', function( d ){
      return strokeColor( d );
    } );

    //prepare for clustered bars
    var clusteredBarPlots = [];
    var clusteredBarPlotCount = 0;
    var secondaryYAxes = [];
    $.each( measureData, function( measure, data ) {
      if( primaryMeasureSettings.chart.type === 'clustered_bar' ) {
        clusteredBarPlotCount++;
      }
    } );

    //iterate across the data prepared from the omh json data
    $.each( measureData, function( measure, data ) {

      var dataset = new Plottable.Dataset( data );
      var measureSettings = getMeasureSettings( measure );
      dataset.measure = measure;

      if( measureSettings.chart.type === 'clustered_bar' ){

        //because datasets cannot have different scales in the clustered bars
        //multiple plots are added, each with all but one dataset zeroed out,
        //and each with a different scale and its own y axis

        var barYScale = yScale;
        if ( clusteredBarPlots.length > 0 ){
          var domain = measureSettings.range;
          var units = measureSettings.units;
          barYScale = new Plottable.Scales.Linear()
          .domainMin( domain.min ).domainMax( domain.max );
          var barYAxis = new Plottable.Axes.Numeric( barYScale, 'right');
          var barYLabel = new Plottable.Components.AxisLabel( units, '0')
          .padding(5)
          .xAlignment('left')
          .yAlignment('top');
          secondaryYAxes.push( [ barYAxis, barYLabel ] );
        }

        var clusteredBarPlot = new Plottable.Plots.ClusteredBar()
          .x( function(d) { return d.x; }, xScale )
          .y( function(d) { return d.y; }, barYScale )
          .attr('fill', function( d ){
            return barColor( d );
        } );

        clusteredBarPlots.push( clusteredBarPlot );

        for ( var i=0; i<clusteredBarPlotCount; i++ ){
          //add blank data for all but one of the datasets
          if( i === clusteredBarPlots.length-1 ){
            clusteredBarPlot.addDataset( dataset );
          } else {
            clusteredBarPlot.addDataset( new Plottable.Dataset( [] ) );
          }
        }

        //prevent time axis from showing detail past the day level
        var axisConfigs = xAxis.axisConfigurations();
        var filteredAxisConfigs = [];
        $.each( axisConfigs, function( index, config ) {
          if ( config[0].interval === 'day' || config[0].interval === 'month' ||  config[0].interval === 'year' ){
            filteredAxisConfigs.push( config );
          }
        } );
        xAxis.axisConfigurations( filteredAxisConfigs );

        plots.push( clusteredBarPlot );

      } else {

        //set up lines that connect the dots
        var linePlot = new Plottable.Plots.Line()
        .x( function(d) { return d.x; }, xScale )
        .y( function(d) { return d.y; }, yScale )
        .attr('stroke',measureSettings.chart.lineColor )
        .attr('stroke-width', LINE_STROKE_WIDTH );

        //add data
        linePlot.addDataset( dataset );
        pointPlot.addDataset( dataset );

        //prepare for plot group
        plots.push( linePlot );

      }


    });

    //add threshold plotlines
    var thresholdXScale = new Plottable.Scales.Linear().domainMin( 0 ).domainMax( 1 );
    var thresholdPlot = new Plottable.Plots.Line()
    .x(function(d) { return d.x; }, thresholdXScale )
    .y(function(d) { return d.y; }, yScale )
    .attr('stroke','#dedede')
    .attr('stroke-width', LINE_STROKE_WIDTH);

    $.each( measureData, function( measure, data ) {

      var thresholds = getMeasureSettings( measure ).thresholds;

      if ( thresholds ){

        thresholdPlot.addDataset( new Plottable.Dataset( [
          { x:0, y:thresholds.max },
          { x:1, y:thresholds.max }
        ] ) );

      }

    });

    plots.push( thresholdPlot );

    plots.push( pointPlot );

    if ( clusteredBarPlotCount > 0 ){
      //add legend
      var colorScale = new Plottable.Scales.Color();
      var legend = new Plottable.Components.Legend( colorScale );
      var names = [];
      var colors = [];
      $.each( measureData, function( measure, data ) {
        var measureSettings = getMeasureSettings( measure );
        var name = measureSettings.seriesName;
        var color = measureSettings.chart.barColor;
        if ( name && color ) {
          names.push( name );
          colors.push( color );
        }
      });
      colorScale.domain( names );
      colorScale.range( colors );
      legend.maxEntriesPerRow( 2 );
      legend.symbol( Plottable.SymbolFactories.square );
      legend.xAlignment("right");
      legend.yAlignment("top");
      plots.push( legend );
    }

    if ( interfaceSettings.panZoom.enabled && interfaceSettings.panZoom.showHint ){

      var pziHint = new Plottable.Components.Label('( Drag chart to pan, pinch or scroll to zoom )', 0)
      .padding(10)
      .yAlignment('bottom')
      .xAlignment('right')
      .addClass('zoom-hint-label');
      var pziHintClickInteraction = new Plottable.Interactions.Click()
      .attachTo( pziHint )
      .onClick( function( point ) {
        hidePanZoomHint();
      });

      var hidePanZoomHint = function(){
        pziHint.addClass('hidden');
      };

      plots.push( pziHint );

    }


    //build table
    var plotGroup = new Plottable.Components.Group( plots );
    var yAxisGroup = new Plottable.Components.Group( [ yAxis, yLabel ] );
    var topRow = [ yAxisGroup, plotGroup ];
    var bottomRow = [ null, xAxis ];
    $.each( secondaryYAxes, function( index, axisAndLabel ){
      topRow.push( new Plottable.Components.Group( axisAndLabel ) );
      bottomRow.push( null );
    });
    chart = new Plottable.Components.Table([
      topRow,
      bottomRow
    ]);
    chart.yAlignment('bottom');
    drag.attachTo( chart );



    //limit the width of the timespan
    //eg so that bars do not have times under them etc
    var limits = primaryMeasureSettings.chart.daysShownOnTimeline;
    var minDays = limits.min;
    var maxDays = limits.max;

    if ( interfaceSettings.panZoom.enabled ) {

      //set up pan/zoom                
      var pzi = new Plottable.Interactions.PanZoom();
      pzi.addXScale( xScale );
      //pzi.addYScale( yScale );
      pzi.attachTo( plotGroup );
      var pziXAxis = new Plottable.Interactions.PanZoom();
      pziXAxis.addXScale( xScale );
      pziXAxis.attachTo( xAxis );

      if( minDays ){
        pzi.minDomainExtent( xScale, minDays*MS_PER_DAY );
        pziXAxis.minDomainExtent( xScale, minDays*MS_PER_DAY );
      }

      if( maxDays ){
        pzi.maxDomainExtent( xScale, maxDays*MS_PER_DAY );
        pziXAxis.maxDomainExtent( xScale, maxDays*MS_PER_DAY );
      }

    }

    if( maxDays ){

      //limit the width of the timespan on load so that bars do not get too narrow
      var measureExtentsData = [];
      $.each( measureData, function( measure, data ) {
        $.each( data, function( index, datum ) {
          measureExtentsData.push( datum.x );
        });
      });
      var measureExtents = xScale.extentOfValues( measureExtentsData );
      var fullExtentMs = measureExtents[ 1 ].getTime() - measureExtents[ 0 ].getTime();
      var maxMs = maxDays * MS_PER_DAY;
      if ( fullExtentMs > maxMs ){
        measureExtents[ 1 ] = new Date( measureExtents[ 0 ].getTime() + maxMs );
      }
      xScale.domain( measureExtents );

    }

    var setZoomLevelByDays = function( timeInDays ){

      var limits = primaryMeasureSettings.chart.daysShownOnTimeline;
      var minDays = limits.min;
      var maxDays = limits.max;

      if ( minDays ) {
        timeInDays = Math.max( timeInDays, minDays );
      }
      if ( maxDays ) {
        timeInDays = Math.min( timeInDays, maxDays );
      }

      var currentDomain = xScale.domain();
      var extents = [ currentDomain[ 0 ], new Date( currentDomain[ 0 ].getTime() + timeInDays*MS_PER_DAY ) ];
      xScale.domain( extents );

    };

    var setZoomLevelByPercentageIncrement = function( percentage ){

      var limits = primaryMeasureSettings.chart.daysShownOnTimeline;
      var minDays = limits.min;
      var maxDays = limits.max;

      var currentDomain = xScale.domain();

      timeInDays = ( currentDomain[ 1 ].getTime() - currentDomain[ 0 ].getTime() ) / MS_PER_DAY;
      timeInDays *= ( 100 - percentage )/100;

      if ( minDays ) {
        timeInDays = Math.max( timeInDays, minDays );
      }
      if ( maxDays ) {
        timeInDays = Math.min( timeInDays, maxDays );
      }

      var extents = [ currentDomain[ 0 ], new Date( currentDomain[ 0 ].getTime() + timeInDays*MS_PER_DAY ) ];
      xScale.domain( extents );

    };

    var shiftVisibleTimeByPercentageIncrement = function( percentage ){

      var currentDomain = xScale.domain();

      timeInDays = ( currentDomain[ 1 ].getTime() - currentDomain[ 0 ].getTime() ) / MS_PER_DAY;
      timeInDays *= percentage/100;

      var extents = [ new Date( currentDomain[ 0 ].getTime() + timeInDays*MS_PER_DAY ), new Date( currentDomain[ 1 ].getTime() + timeInDays*MS_PER_DAY ) ];
      xScale.domain( extents );

    };

    var clearZoomLevelButtonActiveStates = function(){
      $('.time-button').removeClass('active');
    };

    if ( interfaceSettings.toolbar.enabled ){

      var $toolbar = $('<div></div>');
      $toolbar.addClass('chart-toolbar');
      $toolbar.attr('unselectable', 'on');
      element.append( $toolbar );

      if ( interfaceSettings.timespanButtons.enabled ){

        var zoomLevels = {
          '1wk': 7,
          '1m': 30,
          '3m': 90,
          '6m': 180,
        };
        $toolbar.append( $('<span class="time-buttons-label">Show: </span>') );
        $.each( zoomLevels, function( label, days ){
          if ( days <= maxDays && days >= minDays ){
            var $button = $( '<span class="time-button">'+label+'</span>' );
            $button.on( 'click', function(){
              clearZoomLevelButtonActiveStates();
              setZoomLevelByDays( days );
              $( this ).addClass('active');
            });
            $toolbar.append( $button );
          }
        });

      }

      if ( interfaceSettings.zoomButtons.enabled ){

        var zoomPercentageIncrements = {
          '&#8722;': -20,
          '&#43;':    20,
        };
        $toolbar.append( $('<span class="zoom-buttons-label"> Zoom: </span>') );
        $.each( zoomPercentageIncrements, function( label, percentageIncrement ){
          var $button = $( '<span class="zoom-button">'+label+'</span>' );
          $button.on( 'click', function(){
            clearZoomLevelButtonActiveStates();
            setZoomLevelByPercentageIncrement( percentageIncrement );
          });
          $toolbar.append( $button );
        });

      }

      if ( interfaceSettings.navigation.enabled ){

        var $prevButton = $('<span class="previous-time-period-button">< prev</span>').click( function(){
          shiftVisibleTimeByPercentageIncrement( -100 );
        });
        $toolbar.prepend( $prevButton );
        var $nextButton = $('<span class="next-time-period-button">next ></span>').click( function(){
          shiftVisibleTimeByPercentageIncrement( 100 );
        });
        $toolbar.append( $nextButton );

      }

    }


    var pointPlotDatasets = pointPlot.datasets();
    var hasPointPlot = pointPlotDatasets && pointPlotDatasets.length > 0;

    if ( interfaceSettings.tooltips.enabled && hasPointPlot ){

      var toolTipParent = selection;

      //set up hover

      //the last point to show a hover state is stored in this variable
      var hoverPoint = null;

      //change the appearance of a point on hover
      var highlightPoint = function( entity ){
        entity.selection.style('opacity','1');
      };
      var resetPoint = function( entity ){
        entity.selection.style('opacity',POINT_OPACITY);
      };

      //change an entire group of points' appearances on hover
      var highlightGroup = function( groupName, index ){
        $.each( entityHoverGroups[ groupName ][ index ], function( i, p ){ highlightPoint(p); } );
      };
      var resetGroup = function(  groupName, index ){
        $.each( entityHoverGroups[ groupName ][ index ], function( i, p ){ resetPoint(p); } );
      };

      var showToolTip = function( entity ){
        tip.show( entity.datum, entity.selection[0][0] );
      };

      var showTooltipIfInBounds = function( entity ){
        if ( entity ){
          if( entity.selection[0][0].getBoundingClientRect().left >
              selection[0][0].getBoundingClientRect().left &&
              entity.selection[0][0].getBoundingClientRect().right <
              selection[0][0].getBoundingClientRect().right 
          ){
            showToolTip( entity );
          }else{
            tip.hide();
          }
        }
      };

      var showHoverPointTooltip = function() {
        if ( hoverPoint ){
          if( hoverPoint.datum.hasTooltip ){
            showTooltipIfInBounds( hoverPoint );
          } else {
            var groupHoverPoint = tooltipHoverPointEntities[ hoverPoint.datum.groupName ][ hoverPoint.index ];
            var tipHeight = $('.d3-tip')[0].clientHeight;
            if( groupHoverPoint.selection[0][0].getBoundingClientRect().top >
              selection[0][0].getBoundingClientRect().top + tipHeight ){
              showTooltipIfInBounds( groupHoverPoint );
            }else{
              showTooltipIfInBounds( hoverPoint );
            }
          }
        }
      };

      var highlightNewHoverPoint = function( point ) {
        if( hoverPoint !== null ) {
          if( point.datum.body !== hoverPoint.datum.body ){
            resetGroup( hoverPoint.datum.groupName, hoverPoint.index );
            hoverPoint = point;
            highlightGroup( hoverPoint.datum.groupName, point.index );
          }
        }else{
          hoverPoint = point;
        }
        if ( point.datum === null ) {
          return;
        }
      };

      //set up plottable's hover-based point selection interaction
      var pointer = new Plottable.Interactions.Pointer();

      pointer.onPointerExit( function(p) {
        tip.hide();
      });
      pointer.onPointerEnter( showHoverPointTooltip.bind(this) );

      //add to pointer Interactions
      var pointerMove = function(p){
        var nearestEntity;
        try{
          nearestEntity = pointPlot.entityNearest(p);
        } catch( e ) {
          return;
        }
        highlightNewHoverPoint( nearestEntity );
        showHoverPointTooltip();
      }.bind(this);
      pointer.onPointerMove( pointerMove );
      pointer.attachTo( pointPlot );

      //define tooltip html content based on data point
      var getTipContent = function( d, measureList ){

        var content;

        var contentCssClass = 'value';
        if ( aboveThreshold( d ) ) {
          contentCssClass += ' above-threshold';
        }

        //show different tool tip depending on measureList
        if( d.groupName === '_systolic_blood_pressure_diastolic_blood_pressure' ) {
          var systolic = d.body.systolic_blood_pressure.value.toFixed( 0 );
          var diastolic = d.body.diastolic_blood_pressure.value.toFixed( 0 );
          content = '<div class="' + contentCssClass + '">' + systolic + '/' + diastolic + '</div>';
        }else if( d.groupName === '_heart_rate' ) {
          //heart rate does not need decimal places. an integer is best
          content = '<div class="' + contentCssClass + '">' + d.y.toFixed( 0 ) + '</div>';
        }else {
          content = '<div class="' + contentCssClass + '">' + d.y.toFixed( 1 ) + '</div>';
        }
        var timeFormat = interfaceSettings.tooltips.timeFormat;
        content += '<div class="time">' + moment( d.x ).format( timeFormat ) + '</div>';
        content += '<div class="provider">' + d.provider + '</div>';
        return content;

      };

      //initialize the tooltip
      var tip = d3.tip().attr('class', 'd3-tip').html(function(d) {
        return '<div class="omh-tooltip">' + getTipContent( d, measureList ) + '</div>';
      });

      //invoke the tip in the context of the chart
      toolTipParent.call(tip);

    }


    //save a ref to a destroy method
    this.destroy = function (){
      pointer && pointer.offPointerMove( pointerMove );
      pointer && pointer.detachFrom( pointPlot );
      drag.detachFrom( chart );
      chart.destroy();
      tip && tip.destroy();
      showHoverPointTooltip && mouseWheelDispatcher.offWheel( showHoverPointTooltip );
      showHoverPointTooltip && drag.offDrag( showHoverPointTooltip );
      $toolbar && $toolbar.remove();
      $.each( destroyers, function( index, destroyer ){
        destroyer();
      });
    };

    //render chart

    chart.renderTo( selection );

    //collect the points on the chart that will have tooltips
    //or share an index so that they can be used for group hovers
    $.each( pointPlot.entities(), function( entityIndex, entity ) {

      var groupName = entity.datum.groupName;

      if ( !tooltipHoverPointEntities[ groupName ] ){
        tooltipHoverPointEntities[ groupName ] = [];
      }
      if( entity.datum.hasTooltip ){
        tooltipHoverPointEntities[ groupName ][ entity.index ] = entity;
      }

      if ( !entityHoverGroups[ groupName ] ){
        entityHoverGroups[ groupName ] = [];
      }
      if ( !entityHoverGroups[ groupName ][ entity.index ] ){
        entityHoverGroups[ groupName ][ entity.index ] = [];
      }
      entityHoverGroups[ groupName ][ entity.index ].push( entity );

    });

  };

  return parent;

} ) );