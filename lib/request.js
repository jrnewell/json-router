var _ = require('lodash');

var init = function(jsonRouter, depMap, requestOrder) {
  var _anyDeps = false;

  var updateStatus = function(req, status) {
    if (req._status !== status) {
      req._status = status;
      jsonRouter.emit("status", req.requestId, req._status, req);
    }
  };

  var initRequest = function(req) {
    updateStatus(req, "waiting");
    req._parent = null;
    req._children = [];
    req._orderIdx = 0;
    if (!req.requestId) req.requestId = req.name;
    if (depMap[req.requestId]) {
      updateStatus(req, "cancelled");
      req._skip = true;
      req._error = "Request skipped due duplicate requestId";
      return;
    }
    depMap[req.requestId] = req;
    if (req.dependsOn && !_anyDeps) _anyDeps = true;

    // define some getters
    Object.defineProperty(req, "status", { get: function() { return this._status; }});
    Object.defineProperty(req, "parent", { get: function() { return this._parent; }});
    Object.defineProperty(req, "children", { get: function() { return this._children; }});
  };

  var addToDependencyTree = function(req) {
    if (req.dependsOn) {
      var parent = depMap[req.dependsOn];
      if (parent) {
        parent._children.push(req);
        req._parent = parent;
      }
    }
  };

  var updateSubtreeOrderIdx = function(req) {
    var recurse = function(idx, req) {
      req._orderIdx = idx + 1;
      _.each(req._children, function(child) { recurse(req._orderIdx, child); });
    }
    _.each(req._children, function(child) { recurse(req._orderIdx, child); });
  };

  var cancelDependencies = function(req, errorMsg) {
    var recurse = function(req) {
      updateStatus(req, "cancelled");
      req._skip = true;
      req._error = (errorMsg ? errorMsg : "Request cancelled");
      _.each(req._children, recurse);
    };
    _.each(req._children, recurse);
  }

  var addRequestToOrderList = function(req) {
    // make sure the array is long enough
    var newLeng = req._orderIdx + 1;
    if (newLeng > requestOrder.length) {
      while (requestOrder.length < newLeng) {
        requestOrder.push([]);
      }
    }

    // add to array
    requestOrder[req._orderIdx].push(req);
  };

  var initRequestList = function(requestList) {

    // initialize depedency metadata
    _.each(requestList, initRequest);

    // we can skip these parts if no dependencies were detected
    if (_anyDeps) {

      // build depdency tree
      _.each(requestList, addToDependencyTree);

      // iterate over tree to determine depth (stored in _orderIdx)
      _.each(requestList, function(req) {
        if (_.isNull(req._parent)) {
          updateSubtreeOrderIdx(req);
        }
      });

      // build up request order array
      _.each(requestList, addRequestToOrderList);
    }
    else {
      requestOrder.push(requestList);
    }
  };

  return {
    get anyDeps() {
      return _anyDeps;
    },
    updateStatus: updateStatus,
    initRequest: initRequest,
    addToDependencyTree: addToDependencyTree,
    updateSubtreeOrderIdx: updateSubtreeOrderIdx,
    cancelDependencies: cancelDependencies,
    addRequestToOrderList: addRequestToOrderList,
    initRequestList: initRequestList
  };
};

module.exports = {
  init: init
};