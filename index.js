'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var lambda = new AWS.Lambda();

exports.handler = function(event, context, callback) {

    var jobId = event["CodePipeline.job"].id;
    //var stackName = event["CodePipeline.job"].data.inputArtifacts[0].name;

    //console.log(stackName);
    // Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
    // health checked by this function.
    var stackParams = {
        StackName: 'MyBetaStack3',
        TemplateStage: 'Processed'
    };
    
    // var stackParams = {
    //     StackName: 'MyBetaStack3',
    //     TemplateStage: 'Processed'
    // };

    var restApiIdVal;

    var cfGetTemplate = function(message) {
        var cpParams = {
            jobId: jobId
        };
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        console.log(err, err.stack);
                    }
                    else {
                        //console.log(util.inspect(data, {depth: null}));
                        var templateBody = data.TemplateBody;
                        var jsonTemplate = JSON.parse(templateBody);
                        var functionName = jsonTemplate.Resources.CCTFunction.Properties.FunctionName;

                        // Update of the Role happens here.    
                        var functionUpdateParams = {
                            FunctionName: functionName, 
                            Handler: "index.handler", 
                            MemorySize: 128, 
                            Role: "arn:aws:iam::902849442700:role/LambdaFullAccess", 
                        };

                        lambda.updateFunctionConfiguration(functionUpdateParams, function(err, data) {
                            if (err) console.log(err, err.stack); // an error occurred
                            else;     //console.log(data);           // successful response
                        });    
                        //console.log(functionName);
                        
                        var stagingAliasParams = {
                            FunctionName: functionName, /* required */
                            Name: 'staging' /* required */
                        };

                        var prodAliasParams = {
                            FunctionName: functionName, /* required */
                            Name: 'prod' /* required */
                        };

                        var createStagingAliasParams = {
                            FunctionName: functionName, /* required */
                            FunctionVersion: '$LATEST', /* required */
                            Name: 'staging', /* required */
                            Description: 'Staging Alias'
                        };

                        var createProdAliasParams = {
                            FunctionName: functionName, /* required */
                            FunctionVersion: '$LATEST', /* required */
                            Name: 'prod', /* required */
                            Description: 'Production Alias'
                        };

                        lambda.getAlias(stagingAliasParams, function(err, data) {
                            if (err) console.log(err, err.stack);
                            else
                                console.log(data);
                                if (data === null) {
                                    lambda.createAlias(createStagingAliasParams, function(err, data) {
                                        if (err) console.log(err, err.stack); // an error occurred
                                        else     console.log(data);           // successful response
                                    });
                                }; 
                            ;    
                        });

                        lambda.getAlias(prodAliasParams, function(err, data) {
                            if (err) console.log(err, err.stack);
                            else 
                                console.log(data);
                                if (data === null) {
                                    lambda.createAlias(createProdAliasParams, function(err, data) {
                                        if (err) console.log(err, err.stack); // an error occurred
                                        else     console.log(data);           // successful response
                                    });        
                                };   
                            ;    
                        });  
                    } 
                });
                callback(null, message);
            }    
        });    
    }    
    cfGetTemplate('Success');
};