// DO NOT EDIT THIS FILE.
// This file is part of the Jax Framework.
// If you edit this file, your changes will be lost when framework updates are applied.

// Copyright (c) 2010-2016 Ronald B. Cemer
// All rights reserved.
// This software is released under the BSD license.
// Please see the accompanying LICENSE.txt for details.

var activePopupSearch = null;
var activePopupSearchNextFocusElem = null;

// Construct a new PopupSearch instance.
// Parameters:
//   componentId A unique id for the search table component.  Must be unique within the HTML
//     document, and must not already exist.  A component with this id will be created
//     automatically the first time the popup search is used.  This is the id tag of the table
//     itself, and must be in the form <popupSearchName>Table.
//   createParams An associative array which is passed to the AJAXSearchGrid or dataTable
//     constructor.  Which constructor is called, depends on the presence and value of the
//     searchPresentation attribute in createParams.  If searchPresentation is present and
//     is set to 'AJAXSearchGrid', then the AJAXSearchGrid constructor is called.  If searchPresentation
//     is missing, or is present and is set to 'dataTables' (or any value other than 'AJAXSearchGrid'),
//     the dataTables constructor is called.
//     For the AJAXSearchGrid constructor, see AJAXSearchGrid.js.
//     For the dataTables constructor, see the documentation at datatables.net for details.
//     Various internal behaviors and external APIs are changed based on this setting.
//     All new popup searches should use the AJAXSearchGrid search presentation.  Use of dataTables
//     is deprecated.
//     Additional parameters which are used by this class:
//         searchPresentation: 'AJAXSearchGrid' to use AJAXSearchGrid.js for the search presentation, or
//           'dataTables' to use the (deprecated) dataTables search presentation.
//           Optional.  Defaults to 'dataTables'.
//         idColumn: The name of the unique-identifying id column for the rows being searched.
//           Required when searchPresentation is 'AJAXSearchGrid'.
//         headerColumnsHTML: The raw HTML, including AngularJS tags and attributes, for the
//           header columns.  Required when searchPresentation is 'AJAXSearchGrid'.
//         bodyColumnsHTML: The raw HTML, including AngularJS tags and attributes, for the
//           body columns.  Required when searchPresentation is 'AJAXSearchGrid'.
//         rowSelectCallbackFunction: A function to call when a row is selected.  Optional.
//           Only used when searchPresentation is 'AJAXSearchGrid'.
//           If provided, when the user selects a row, the callback function will be called
//           with three arguments:
//               * The id of the row which was selected
//               * The index of the row which was selected, relative to the current page of results
//               * The row which was selected
//   selectCopyValues An optional associative array which determines which values (if any) get
//     copied into which input elements in the form, when the rowSelected(aData) function is called.
//     This is an associative array of of column names to jQuery selectors.  The column names
//     (keys) are column names within the datatable.  The corresponding values are jQuery
//     selectors which match the target fields for the source column values.
//     Optional.  Defaults to an empty associative array.
//     Note that this attribute can also be set after-the-fact.  Changing it affects subsequently
//     selected rows.
function PopupSearch(componentId, createParams, selectCopyValues) {
	this.componentId = componentId;
	this.popupSearchName = componentId.replace(/Table$/, '');
	this.createParams = createParams;
	this.selectCopyValues = (typeof(selectCopyValues) != 'undefined') ? selectCopyValues : {};

	this.searchPresentation =
		((typeof(createParams.searchPresentation != 'undefined')) &&
		 (createParams.searchPresentation == 'AJAXSearchGrid')) ? 'AJAXSearchGrid' : 'dataTables';
	if ((this.searchPresentation != 'AJAXSearchGrid') && (this.searchPresentation != 'dataTables')) {
		this.searchPresentation = 'dataTables';
	}

	switch (this.searchPresentation) {
	case 'AJAXSearchGrid':
		this.containerId = componentId+'Cont';
		this.ajaxSearchGrid = null;
		this.container = null;
		break;
	case 'dataTables':
		this.dataTableComponentId = componentId;
		this.dataTableComponentWrapperId = componentId+'_wrapper';
		this.dataTableCreateParams = createParams;
		this.dataTable = null;
		this.dataTable_wrapper = null;
		break;
	}

	this.popupSearchShowing = false;
	this.prev_enforceFocus = null;

	// This can be called externally before calling show(), to keep track of which
	// field the pop-up search is trying to populate.
	// As a convenience, if show() is called with any arguments, this will be set to
	// the first argument passed into show().
	// This is automatically set back to empty when the pop-up search is hidden.
	this.targetField = '';
}

// Show the popup search.
PopupSearch.prototype.show = function() {
	if (activePopupSearch != null) {
		// A popup search is already active.
		if (activePopupSearch === this) {
			// This popup search is already active.  Nothing to do.
			return;
		}
		if (!activePopupSearch.popupSearchShowing) {
			// The popup search was activated, but is not yet showing.
			// We can't activate another one yet, or it could cause race conditions
			// and other bad things.
			return;
		}
		// Hide the active popup search.
		activePopupSearch.hide();
	}
	activePopupSearch = this;

	if (arguments.length >= 1) {
		this.targetField = arguments[0];
	}

	var container;

	switch (this.searchPresentation) {
	case 'AJAXSearchGrid':
		this.autoCreateSearchComponent();
		container = this.container;
		break;
	case 'dataTables':
		this.autoCreateDataTable();

		var url = this.dataTable.fnSettings().sAjaxSource;
		if (typeof fixupAJAXURL == 'function') {
			// Fixup the URL, adding any required parameters.
			url = fixupAJAXURL(url);
			// Eliminate duplicated parameters from the query string, keeping the last instance of
			// each unique parameter.
			var qidx = url.indexOf('?');
			if (qidx >= 0) {
				// Step 1: parse query string into params associative array, overwriting previous
				// instances of keys in params with later instances of the same keys.
				var query = url.substring(qidx+1);
				var pieces = query.split('&');
				var params = {};
				for (var i = 0; i < pieces.length; i++) {
					var piece = pieces[i];
					var eidx = piece.indexOf('=');
					var k, v;
					if (eidx >= 0) {
						k = decodeURIComponent(piece.substring(0, eidx));
						v = decodeURIComponent(piece.substring(eidx+1));
					} else {
						k = decodeURIComponent(piece);
						v = '';
					}
					if (k != '') params[k] = v;
				}
				// Step 2: convert params back into a new query string with duplicate keys eliminated.
				var query = '';
				var sep = '';
				for (var k in params) {
					query += sep+encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
					if (sep == '') sep = '&';
				}
				// Step 3: replace old query string with new.
				url = url.substring(0, qidx+1)+query;
			}
		}
		this.dataTable.fnSettings().sAjaxSource = url;

		this.dataTable.fnDraw();

		container = this.dataTable_wrapper;
		break;
	}

	var tfmt = _t('popupSearch.titleFmt');
	var tdesc = _t('popupSearch.'+this.popupSearchName+'.tableDescriptions');
	var title = ((tfmt != '') && (tdesc != '')) ?
		sprintf(
			tfmt,
			_t('popupSearch.'+this.popupSearchName+'.tableDescriptions')
		) :
		'';

	$.colorbox({
		width:"95%",
		height:"95%",
		title:title,
		inline:true,
		href:container,
		onOpen:__popupSearch__onShown__,
		onClosed:__popupSearch__onHidden__
	});
}

// Hide the pop-up search.
PopupSearch.prototype.hide = function() {
	// Only try to hide the popup search if we know it's currently showing.
	if ((activePopupSearch !== null) && (activePopupSearch.popupSearchShowing)) {
		$.colorbox.close();
	}
}

__popupSearch__onShown__ = function() {
	if (activePopupSearch !== null) {
		// Note the fact that the popup search was successfully shown.
		activePopupSearch.popupSearchShowing = true;

		switch (activePopupSearch.searchPresentation) {
		case 'AJAXSearchGrid':
			activePopupSearch.container.show();
			activePopupSearch.ajaxSearchGrid.$scope.searchText = '';
			activePopupSearch.ajaxSearchGrid.$scope.searchBy = '';
			activePopupSearch.ajaxSearchGrid.revertToDefaultSorts();
			activePopupSearch.ajaxSearchGrid.$scope.triggerSearch(
				activePopupSearch.ajaxSearchGrid.$scope.userGestureSearchTimeoutMS,
				true
			);
			setTimeout(
				function() {
					$('.jax-grid-pager-search-text-input:first', activePopupSearch.container).focus();
				},
				1000
			);
			break;
		case 'dataTables':
			activePopupSearch.dataTable_wrapper.show();
			break;
		}
	}
}

__popupSearch__onHidden__ = function() {
	if (activePopupSearch !== null) {
		// Note the fact that the popup search was successfully hidden.
		activePopupSearch.popupSearchShowing = false;

		switch (activePopupSearch.searchPresentation) {
		case 'AJAXSearchGrid':
			// Move the grid container to the end of the document body and hide it.
			if (activePopupSearch.ajaxSearchGrid != null) {
				activePopupSearch.container.appendTo($('body'));
				activePopupSearch.container.hide();
			}
			break;
		case 'dataTables':
			// Move the datatable wrapper to the end of the document body and hide it.
			if (activePopupSearch.dataTable != null) {
				activePopupSearch.dataTable_wrapper.appendTo($('body'));
				activePopupSearch.dataTable_wrapper.hide();
			}
			break;
		}

		activePopupSearch.prev_enforceFocus = null;
		// There is no longer an active popup search.
		activePopupSearch = null;

		if (activePopupSearchNextFocusElem !== null) {
			setTimeout(
				function() {
					if (activePopupSearchNextFocusElem !== null) {
						$(activePopupSearchNextFocusElem).focus();
						activePopupSearchNextFocusElem = null;
					}
				},
				100
			);
		}
	}
}

// Copy pre-determined columns into form fields for a row in the search results.
// See selectCopyValues in the constructor for details.
// A change event will be triggered on each compatible element which has a value copied to it.
// Parameters:
//   aData A linear array of column values for a single row in the table.
PopupSearch.prototype.rowSelected = function(aData) {
	for (var sName in this.selectCopyValues) {
		$(this.selectCopyValues[sName]).val(this.getColValue(sName, aData, '')).trigger('change');
	}
}

// Given the name of a column in the datatable, find the column index.
// This function is only needed when using the (deprecated) dataTables search presentation.
// For the AJAXSearchGrid search presentation, this function always returns sName because AJAXSearchGrid
// represents each row as an object instead of an array.
// Parameters:
//   sName The name of the column.
// Returns:
//   The column index, or -1 if not found.
//   For AJAXSearchGrid search presentation, this function always returns sName.
PopupSearch.prototype.findColIdx = function(sName) {
	switch (this.searchPresentation) {
	case 'AJAXSearchGrid':
		return sName;
	case 'dataTables':
		for (var i = 0; i < this.dataTableCreateParams.aoColumnDefs.length; i++) {
			if (this.dataTableCreateParams.aoColumnDefs[i].sName == sName) return i;
		}
		return -1;
	}
}

// Given the name of a column in the search table and an array of column values for a row in the
// table, get the column's value.
// Parameters:
//   sName The name of the column.
//   aData A linear array of column values for a single row in the table.
//   defaultValue The default value to return if the column does not exist in the row.
//     Optional.  Defaults to null.
// Returns:
//   The column value, or the default value if not found.
PopupSearch.prototype.getColValue = function(sName, aData, defaultValue) {
	if (typeof(defaultValue) == 'undefined') defaultValue = null;

	switch (this.searchPresentation) {
	case 'AJAXSearchGrid':
		if (typeof(aData[sName]) != 'undefined') return aData[sName];
		break;
	case 'dataTables':
		for (var i = 0; i < this.dataTableCreateParams.aoColumnDefs.length; i++) {
			if (this.dataTableCreateParams.aoColumnDefs[i].sName == sName) return aData[i];
		}
		break;
	}

	return defaultValue;
}

PopupSearch.prototype.autoCreateSearchComponent = function() {
	if (this.searchPresentation == 'dataTables') {
		this.autoCreateDataTable();
		return;
	}

	if (this.ajaxSearchGrid != null) return;

	var idColumn = (typeof(this.createParams.idColumn) != 'undefined') ?
		this.createParams.idColumn : '';
	var headerColumnsHTML = (typeof(this.createParams.headerColumnsHTML) != 'undefined') ?
		this.createParams.headerColumnsHTML : '';
	var bodyColumnsHTML = (typeof(this.createParams.bodyColumnsHTML) != 'undefined') ?
		this.createParams.bodyColumnsHTML : '';

	var html =
'<div id="'+this.containerId+'" class="popupSearchAJAXSearchGridContainer" ng-app="JaxGridApp" ng-controller="Controller">\
 <div class="jax-grid-pager" has-search-box has-search-by></div>\
 <table id='+this.componentId+'>\
  <thead>\
   <tr>\
'+headerColumnsHTML+'\
   </tr>\
  </thead>\
  <tbody>\
   <tr ng-repeat="i in getRowIndexes()" ng-class-odd="\'odd\'" ng-class-even="\'even\'" ng-class="{highlighted: i==highlightedRowIdx}">\
'+bodyColumnsHTML+'\
   </tr>\
  </tbody>\
 </table>\
 <div class="jax-grid-pager" has-search-box has-search-by></div>\
</div>\
';

	$(html).appendTo($('body'));
	this.container = $('#'+this.containerId);
	this.container.hide();
	angular.bootstrap(this.container, ['JaxGridApp']);
	this.ajaxSearchGrid = new AJAXSearchGrid(this.container, this.createParams);
	this.ajaxSearchGrid.$scope.rowSelectLinkClicked = function(rowIdx, row, evt) {
		if (activePopupSearch != null) {
			activePopupSearch.rowSelected(row);
		}

		var rowSelectCallbackFunction = null;
		switch (typeof(activePopupSearch.createParams.rowSelectCallbackFunction)) {
		case 'function':
			rowSelectCallbackFunction = activePopupSearch.createParams.rowSelectCallbackFunction;
			break;
		case 'string':
			try {
				rowSelectCallbackFunction = eval(activePopupSearch.createParams.rowSelectCallbackFunction);
				if (typeof(rowSelectCallbackFunction) != 'function') rowSelectCallbackFunction = null;
			} catch (ex) {}
			break;
		}

		if (rowSelectCallbackFunction !== null) {
			rowSelectCallbackFunction(row[idColumn], rowIdx, row);
		}
		if (activePopupSearch != null) {
			activePopupSearch.hide();
		}
		if (evt) {
			if (!evt.isPropagationStopped()) evt.stopPropagation();
			if (!evt.isDefaultPrevented()) evt.preventDefault();
		}
	}
	this.ajaxSearchGrid.hotKeyActionMap.push({
		which:13,
		altKey:false,
		ctrlKey:false,
		shiftKey:false,
		metaKey:false,
		callback:function(ajaxGrid, evt) {
			if (ajaxGrid.$scope.highlightedRowIdx >= 0) {
				ajaxGrid.$scope.rowSelectLinkClicked(
					ajaxGrid.$scope.highlightedRowIdx,
					ajaxGrid.$scope.rows[ajaxGrid.$scope.highlightedRowIdx],
					evt
				);
			}
		}
	});
}

// This function should typically not be called externally.
// It is called internally when needed.
// However if a situation arises where you need to be sure the datatable has been
// created, you can call this function safely from external code.
PopupSearch.prototype.autoCreateDataTable = function() {
	if (this.searchPresentation == 'AJAXSearchGrid') {
		this.autoCreateSearchComponent();
		return;
	}

	if (this.dataTable != null) return;

	var html =
		'<table border="0" cellpadding="0" cellspacing="1" class="popupSearchDataTable display" id="'+
		this.dataTableComponentId+'">'+'<thead><tr>';
	for (var i = 0; i < this.dataTableCreateParams.aoColumnDefs.length; i++) {
		html += '<th';
		if (typeof(this.dataTableCreateParams.aoColumnDefs[i].sHeaderClass)!='undefined') {
			html += ' class="'+this.dataTableCreateParams.aoColumnDefs[i].sHeaderClass+'"';
		}
		if (typeof(this.dataTableCreateParams.aoColumnDefs[i].sWidth) != 'undefined') {
			html += ' width="'+this.dataTableCreateParams.aoColumnDefs[i].sWidth+'"';
		}
		html += '></th>';
	}
	html +=
		'</tr></thead>'+
 		'<tbody><tr><td colspan="'+this.dataTableCreateParams.aoColumnDefs.length+
		'" class="dataTables_empty">Loading data from server...</td>'+
		'</tr></tbody></table>';
	$(html).appendTo($('body'));
	this.dataTable = $('#'+this.dataTableComponentId).dataTable(this.dataTableCreateParams);
	this.dataTable_wrapper = this.dataTable.parent();
	this.dataTable_wrapper.addClass('popupSearchDataTable_wrapper');
	this.dataTable_wrapper.hide();

	PopupSearch.prototype.addFilterColSelectFromBackendSearchableColumns(this.dataTable.fnSettings().sAjaxSource, this.dataTableComponentId);
}

// This function is only applicable to (deprecated) dataTables search presentation.
// This function adds the filter-column select just before the filter input for a dataTable.
// It references no instance variables, so it can be used externally for non-popup dataTable
// components (such as in a CRUD page).
PopupSearch.prototype.addFilterColSelectFromBackendSearchableColumns = function(sAjaxSource, dataTableComponentId) {
	if (this.searchPresentation != 'dataTables') return;

	// Get the list of searchable columns from the server-side search include.
	// If successful, add a select element to allow the user to select which column to search.
	var url = sAjaxSource;
	var idx = url.indexOf('?command=');
	if (idx < 0) idx = url.indexOf('&command=');
	if (idx >= 0) {
		idx = url.indexOf('&', idx+1);
		if (idx < 0) idx = url.length;
		var part1 = url.substr(0, idx);
		var part2 = (idx < url.length) ? url.substr(idx) : '';
		url = part1+'_getSearchableColumns'+part2;
		var json = $.ajax({
			type:'GET',
			url:url,
			async:false,
			cache:false,
			processData:false,
		}).responseText;
		var searchableColumns = [];
		if (json != '') {
			try {
				searchableColumns = JSON.parse(json);
			} catch(ex) { }
		}
		if (searchableColumns.length > 0) {
			var htmlencodediv = $('<div/>');
			var html =
				'<label> '+_t('popupSearch.filterCol.title')+': <select name="'+dataTableComponentId+'_filterCol" id="'+dataTableComponentId+'_filterCol" onchange="PopupSearch.prototype.__dataTable__filterColChanged(this);"><option value="">'+_t('popupSearch.filterCol.option.any.title')+'</option>';
			for (i = 0; i < searchableColumns.length; i++) {
				var sc = searchableColumns[i];
				html += '<option value="'+htmlencodediv.text(sc.pfx+sc.name).html()+'">'+htmlencodediv.text(sc.title).html()+'</option>';
			}
			html += '</select></label>';
			$(html).appendTo($('#'+dataTableComponentId+'_filter'));
		}
	}
}

// Change handler for filter column select elements within (deprecated) dataTables search
// presentation.
// This function references no instance variables.
PopupSearch.prototype.__dataTable__filterColChanged = function(el) {
	var elem = $(el);
	var id = elem.attr('id');
	if (!id.match(/_filterCol$/)) return;

	var filterCol = elem.val();

	var dataTable = $('#'+(id.replace(/_filterCol$/, ''))).dataTable();
	var url = dataTable.fnSettings().sAjaxSource;
	var sep = (url.indexOf('?') >= 0) ? '&' : '?';
	var idx = url.indexOf('?sSearchCol=');
	if ((idx < 0) && (sep == '&')) idx = url.indexOf('&sSearchCol=');
	if (idx < 0) {
		idx = url.length;
		url += '&sSearchCol=';
	}
	idx = url.indexOf('=', idx)+1;
	var part1 = url.substr(0, idx);
	var idx2 = url.indexOf('&', idx+1);
	var part2 = (idx2 >= 0) ? url.substr(idx2) : '';
	url = part1+encodeURIComponent(filterCol)+part2;
	dataTable.fnSettings().sAjaxSource = url;
	dataTable.fnDraw();
}

// Hook a keyDown listener to the document, so that the F7 key will trigger popup searches for the currently focused element.
$(document).keydown(function(evt) {
	switch (evt.which) {
	case 118: // F7
		if (evt.altKey || evt.ctrlKey || evt.shiftKey || evt.metaKey) break;
		var elem = $(evt.target);
		var link = null;
		if (elem.hasClass('popupSearchLink')) {
			link = elem;
		} else if ((elem.hasClass('select2-focusser')) || (elem.hasClass('select2-offscreen'))) {
			link = $(evt.target.parentElement).nextAll('.popupSearchLink:first');
		} else {
			link = elem.nextAll('.popupSearchLink:first');
		}
		if ((link !== null) && (link.length > 0)) {
			activePopupSearchNextFocusElem = elem;
			$(link[0]).click();
		}
		break;
	}
});
