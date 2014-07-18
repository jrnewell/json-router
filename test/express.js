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

      resultsCb(res);

      return done();
    });
}


describe("Express.js TestSuite", function() {

  it("Simple Request", function(done) {
    var handlerCb = function(jsonRouter) {
      jsonRouter.newRequest("testing", function(context, arguments, callback) {

        // assertions
        try {
          context.should.have.property("jsonRouter");
          context.should.have.property("name", "testing");
          context.should.have.property("httpReq");
          context.should.have.property("httpRes");

          expect(arguments).to.exist;
          expect(arguments).to.be.a('array').with.length(1);
          arguments[0].should.equal("foo");
        }
        catch(err) {
          return callback(err);
        }

        return callback(null, {value: 10});
      });
    };

    var postObj = {
      jsonRequests: {
        name: "testing",
        arguments: ["foo"]
      }
    };

    var resultsCb = function(res) {
      // assertions
      expect(res.body).to.exist;
      expect(res.body).to.be.an('object');
      var result = res.body;
      if (result.error) {
        return done(new Error(result.error));
      }
      result.should.have.property("requestId", "testing");
      result.should.have.property("result");
      result.result.should.have.property("value", 10);
    };

    testHarness(handlerCb, postObj, resultsCb, done);
  });

  it("Multiple Requests", function(done) {
    var handlerCb = function(jsonRouter) {
      jsonRouter.newRequest("req1", function(context, arguments, callback) {

        // assertions
        try {
          context.should.have.property("name", "req1");
          expect(arguments).to.exist;
          expect(arguments).to.be.a('array').with.length(1);
          arguments[0].should.equal("foo");
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
          expect(arguments).to.exist;
          expect(arguments).to.be.a('array').with.length(2);
          arguments[0].should.equal("bar");
          arguments[1].should.equal(5);
        }
        catch(err) {
          return callback(err);
        }

        return callback(null, {value: arguments[1]});
      });
    };

    var postObj = {
      jsonRequests: [
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
      expect(res.body).to.exist;
      expect(res.body).to.be.an('object').with.property("req1");
      var result = res.body.req1
      if (result.error) {
        return done(new Error(result.error));
      }
      result.should.have.property("requestId", "req1");
      result.should.have.property("result");
      result.result.should.have.property("value", "test");

      res.body.should.have.property("req2");
      result = res.body.req2
      if (result.error) {
        return done(new Error(result.error));
      }
      result.should.have.property("requestId", "req2");
      result.should.have.property("result");
      result.result.should.have.property("value", 5);
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
      jsonRequests: [
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
      expect(res.body).to.exist;
      expect(res.body).to.be.an('object').with.property("req1");
      var result = res.body.req1
      result.should.have.property("requestId", "req1");
      result.should.have.property("error", "Error: My test error");

      res.body.should.have.property("req2");
      result = res.body.req2
      result.should.have.property("requestId", "req2");
      result.should.have.property("error", "Request skipped due to failed dependency");

      res.body.should.have.property("req3");
      result = res.body.req3
      if (result.error) {
        return done(new Error(result.error));
      }
      result.should.have.property("requestId", "req3");
      result.should.have.property("result");
      result.result.should.have.property("value", "foobar");
    };

    testHarness(handlerCb, postObj, resultsCb, done);
  });

});