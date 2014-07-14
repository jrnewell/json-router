var chai = require('chai');
var expect = chai.expect;
var supertest = require('supertest');
var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
var jsonRouter = require('../index.js');
chai.should();

describe("Express.js TestSuite", function() {

  it("Simple Request", function(done) {
    var app = express();
    app.use(bodyParser.json());

    jsonRouter.newRequest("testing", function(context, arguments, callback) {

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
    app.use(jsonRouter.middleware());

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

        // assertions
        expect(res.body).to.exist;
        expect(res.body).to.be.a('object');
        if (res.body.error) {
          return done(new Error(res.body.error));
        }
        res.body.should.have.property("testing");
        res.body.testing.should.have.property("result", 10);

        return done();
      });
  });

});