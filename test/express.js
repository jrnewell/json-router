var chai = require('chai');
var expect = chai.expect;
var supertest = require('supertest');
var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
chai.should();

var testHarness = function(handlerCb, postObj, resultsCb, done) {
  var app = express();
  app.use(bodyParser.json());
  var jsonRouter = require('../lib/index.js');

  handlerCb(jsonRouter);
  app.use(jsonRouter.middleware());

  var postBody = postObj;

  supertest(app)
    .post("/")
    .send(postBody)
    .expect(200)
    .expect('Content-Type', /json/)
    .end(function(err, res) {
      if (err) return done(err);

      try {
        err = resultsCb(res);
        if (err) return done(err);
      }
      catch(err) { return done(err); }

      return done();
    });
};

var getResult = function(res, resultName, expectError) {
  expect(res.body).to.exist
    .and.to.be.an('object')
    .with.property(resultName);
  var result = res.body[resultName];
  if (!expectError && result.error) {
    throw new Error(result.error);
  }
  return result;
}

describe("Express.js TestSuite", function() {

  it("Simple Request", function(done) {
    var handlerCb = function(jsonRouter) {
      jsonRouter.newRequest("testing", function(context, arguments, callback) {

        // assertions
        try {
          context.should.contain.keys("httpReq", "httpRes", "name", "requestId", "request");
          var req = context.request;
          req.should.contain.keys("name", "arguments", "requestId");
          var status = req.status;
          expect(status).to.equal("running");
          context.should.have.property("name", "testing");
          context.should.have.property("requestId", "testing");

          expect(arguments).to.exist
            .and.to.be.a('array').with.length(1)
            .with.deep.property("[0]", "foo");
        }
        catch(err) {
          return callback(err);
        }

        return callback(null, {value: 10});
      });
    };

    var postObj = {
      jsonRoute: {
        name: "testing",
        arguments: ["foo"]
      }
    };

    var resultsCb = function(res) {
      // assertions
      expect(res.body).to.exist.and.to.be.an('object');
      var result = res.body;
      if (result.error) {
        return new Error(result.error);
      }
      result.should.have.property("requestId", "testing");
      result.should.have.deep.property("result.value", 10);
    };

    testHarness(handlerCb, postObj, resultsCb, done);
  });

  it("Multiple Requests", function(done) {
    var handlerCb = function(jsonRouter) {
      jsonRouter.newRequest("req1", function(context, arguments, callback) {

        // assertions
        try {
          context.should.have.property("name", "req1");
          expect(arguments).to.exist
            .and.to.be.a('array').with.length(1)
            .with.deep.property("[0]", "foo");
        }
        catch(err) {
          return callback(err);
        }

        return callback(null, {value: "test"});
      });
      jsonRouter.newRequest("req2", function(context, arguments, callback) {

        // assertions
        try {
          context.should.have.property("name", "req2");
          expect(arguments).to.exist
            .and.to.be.a('array').with.length(2)
            .and.deep.equal(['bar', 5]);
        }
        catch(err) {
          return callback(err);
        }

        return callback(null, {value: arguments[1]});
      });
    };

    var postObj = {
      jsonRoute: [
      {
        name: "req1",
        arguments: ["foo"]
      },
      {
        name: "req2",
        arguments: ["bar", 5]
      }]
    };

    var resultsCb = function(res) {
      // assertions
      var result = getResult(res, "req1");
      result.should.have.property("requestId", "req1");
      result.should.have.deep.property("result.value", "test");

      var result = getResult(res, "req2");
      result.should.have.property("requestId", "req2");
      result.should.have.deep.property("result.value", 5);
    };

    testHarness(handlerCb, postObj, resultsCb, done);
  });

  it("Dependency Failure", function(done) {
    var handlerCb = function(jsonRouter) {
      jsonRouter.newRequest("req1", function(context, arguments, callback) {
        return callback(new Error("My test error"));
      });
      jsonRouter.newRequest("req2", function(context, arguments, callback) {
        return callback(null, {value: arguments[1]});
      });
      jsonRouter.newRequest("req3", function(context, arguments, callback) {
        return callback(null, {value: "foobar"});
      });
    };

    var postObj = {
      jsonRoute: [
      {
        name: "req1",
        arguments: ["foo"]
      },
      {
        name: "req2",
        arguments: ["bar", 5],
        dependsOn: "req1"
      },
      {
        name: "req3",
        requestId: "req3",
        arguments: []
      }]
    };

    var resultsCb = function(res) {
      // assertions
      var result = getResult(res, "req1", true);
      result.should.have.property("requestId", "req1");
      result.should.have.property("error", "Error: My test error");

      var result = getResult(res, "req2", true);
      result.should.have.property("requestId", "req2");
      result.should.have.property("error", "Request skipped due to failed dependency");

      var result = getResult(res, "req3");
      result.should.have.property("requestId", "req3");
      result.should.have.deep.property("result.value", "foobar");
    };

    testHarness(handlerCb, postObj, resultsCb, done);
  });
});