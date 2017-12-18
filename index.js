/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 * @desc: The Alias creation of backend Lambda is handled by this Lambda. This will create two
 * aliases as "staging" and "prod" respectively.
 */

'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

/**
 * Define AWS API version and intialize the AWS services objects.
 */
AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  codepipeline: '2015-07-09',
  lambda: '2015-03-31'
  // other service API versions
};
var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var lambda = new AWS.Lambda();

// Lambda handler starts here.
exports.handler = function(event, context, callback) {

    // Retrieve the CodePipeline ID 
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
        
       /**
        * Define the CodePipeline parameters. 
        * Currently, it requires only the jobId of CodePipeline.
        */
        var cpParams = {
            jobId: jobId
        };
        /**
         * This method is required to call, since it is part of the Invoke type of CodePipeline.
         */
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                /**
                 * Get the processed template of CF. The API and Lambda names are retrieved from there.
                 */
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        console.log(err, err.stack);
                    }
                    else {
                        /**
                         * Get the Processed template of CloudFormation to retrieve the API and Lambda name.
                         */
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

                        /**
                         * Update the API Lambda Role.
                         */
                        lambda.updateFunctionConfiguration(functionUpdateParams, function(err, data) {
                            if (err) console.log(err, err.stack); // an error occurred
                            else;     //console.log(data);           // successful response
                        });    
                       
                        /**
                         * Define the "staging" alias params
                         */
                        var stagingAliasParams = {
                            FunctionName: functionName, /* required */
                            Name: 'staging' /* required */
                        };

                        /**
                         * Define the "prod" alias params
                         */
                        var prodAliasParams = {
                            FunctionName: functionName, /* required */
                            Name: 'prod' /* required */
                        };

                        /**
                         * Define the "staging" alias params for creation.
                         */
                        var createStagingAliasParams = {
                            FunctionName: functionName, /* required */
                            FunctionVersion: '$LATEST', /* required */
                            Name: 'staging', /* required */
                            Description: 'Staging Alias'
                        };

                        /**
                         * Define the "prod" alias params for creation.
                         */
                        var createProdAliasParams = {
                            FunctionName: functionName, /* required */
                            FunctionVersion: '$LATEST', /* required */
                            Name: 'prod', /* required */
                            Description: 'Production Alias'
                        };

                        /**
                         * Get the current "staging" alias.
                         * If the Alias is null, then create the Alias.
                         */
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

                        /**
                         * Get the current "prod" alias.
                         * If the Alias is null, then create the Alias.
                         */
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
        var failParams = {
            jobId: jobId,
            failureDetails: {
                message: JSON.stringify(message),
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };

        codepipeline.putJobFailureResult(failParams, function(err, data) {
            context.fail(message);      
        });
    };

    // Validate StackName passed in UserParameters.
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }   
    
    // All good stuff start here.
    putJobSuccess('Success');
};