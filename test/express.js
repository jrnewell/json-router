var chai = require('chai');
var expect = chai.expect;
var supertest = require('supertest');
var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
var jsonRouter = require('../index.js');
chai.should();

var util = require('util');

describe("Express.js TestSuite", function() {

  it("testing", function(done) {
    var app = express();
    app.use(bodyParser.json());

    jsonRouter.newRequest("testing", function(context, arguments, callback) {
      console.log("testing request: " + util.inspect(arguments));

      // assertions
      try {
        context.should.have.property("jsonRouter");
        context.should.have.property("name", "testing");
        context.should.have.property("httpReq");
        context.should.have.property("httpRes");

        expect(arguments).to.exist;
        expect(arguments).to.be.a('array');
        arguments.should.have.length(1);
      }
      catch(err) {
        return callback(err);
      }

      return callback(null, {result: 10});
    });
    app.use(jsonRouter.middleware(function(err, req, res, results, next) {
      if (err) {
        res.status(500);
        return res.json({
          error: err.toString()
        });
      }
      console.log("middleware callback: " + util.inspect(results));
      res.json(results);
    }));

    var postBody = {
      jsonRequests: {
        name: "testing",
        arguments: ["foo"]
      }
    };

    supertest(app)
      .post("/")
      .send(postBody)
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }

        console.log("supertest callback: " + util.inspect(res.body));

        // assertions
        expect(res.body).to.exist;
        expect(res.body).to.be.a('object');
        res.body.should.have.property("testing");
        res.body.testing.should.have.property("result", 10);

        return done();
      });
  });

});