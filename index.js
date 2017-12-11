/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 */


'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

/**
 * Define AWS API version
 */

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lambda = new AWS.Lambda();

// Lambda handler start here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var stackName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters; 

    // Define the Cloudformation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName || '',
        TemplateStage: 'Processed'
    };

    // REST Api id of the deployed API.
    var restApiIdVal;

    // Define the Success function.
    var putJobSuccess = function(message) {
        
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

     // Notify AWS CodePipeline of a failed job
    var putJobFailure = function(message) {
        var params = {
            jobId: jobId,
            failureDetails: {
                message: JSON.stringify(message),
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        codepipeline.putJobFailureResult(params, function(err, data) {
            context.fail(message);      
        });
    };

    // Validate the URL passed in UserParameters
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }   
    
    putJobSuccess('Success');
};