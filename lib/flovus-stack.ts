import { App, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { join } from 'path';

import { Cors, IResource, Integration, LambdaIntegration, MockIntegration, PassthroughBehavior, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';


const NAMES = {
  bucket_name: 'tmp_flovus_project',
  table_name: 'TmpFlovus',
  role_for_ec2_name: 'TmpFlovusEC2Role',
  role_for_lamdba_name: 'TmpFlovusLambdaRole',
  profile_for_ec2: 'TmpFlovusEC2Profile',
  lambda_name: 'TmpFlovusLambda',
  api_gateway_name: 'TmpFlovusAPI'
}


class FlovusStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, NAMES.bucket_name, {
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      accessControl: s3.BucketAccessControl.PRIVATE,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const table = new dynamodb.Table(this, NAMES.table_name, {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // create a role that the Ec2 the lambda creates will assume.  
    const role_for_ec2 = new iam.Role(this, NAMES.role_for_ec2_name, {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role_for_ec2.addToPolicy(new iam.PolicyStatement({
      // allow the role full access to the bucket and table created abvoe
      actions: ['s3:*'],
      resources: [bucket.bucketArn],
    }));
    role_for_ec2.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:*'],
      resources: [table.tableArn],
    }));

    //create a role that the lambda function will assume, this role will have full access to the bucket and table
    //and be able to create ec2 instances
    const role_for_lambda = new iam.Role(this, NAMES.role_for_lamdba_name, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    role_for_lambda.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:*'],
      resources: [bucket.bucketArn],
    }));
    role_for_lambda.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:*'],
      resources: [table.tableArn],
    }));
    role_for_lambda.addToPolicy(new iam.PolicyStatement({
      actions: ['ec2:*'],
      resources: ['*'],
    }));

    const instanceProfile = new iam.CfnInstanceProfile(this, NAMES.profile_for_ec2, {
      roles: [role_for_ec2.roleName],
    });

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        bundleAwsSDK: true,
        // externalModules: [
        //   'aws-sdk', // Use the 'aws-sdk' available in the Lambda runtime
        // ],
      },
      // depsLockFilePath: join(__dirname, 'lambdas', 'package-lock.json'),
      environment: {
        PROFILE_ARN: instanceProfile.attrArn, 
        BUCKET_NAME: bucket.bucketName,
        TABLE_NAME: table.tableName
      },
      role: role_for_lambda,
      runtime: Runtime.NODEJS_20_X,
    }

    // Lambda function
    const myLambda = new NodejsFunction(this, NAMES.lambda_name, {  
      entry: join(__dirname, 'lambdas', 'index.js'),
      ...nodeJsFunctionProps
    });

    table.grantFullAccess(myLambda);
    bucket.grantReadWrite(myLambda);

    // API Gateway
    const api = new RestApi(this, NAMES.api_gateway_name, {
      restApiName: 'Flovus Service',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: Cors.DEFAULT_HEADERS,
      }
    });

    const resource = api.root.addResource("flovus")

    const integrationOptions = {
      requestParameters: {
        'integration.request.header.X-Amz-Invocation-Type': 'method.request.header.InvocationType'
      }
    }

    resource.addMethod('POST', new LambdaIntegration(myLambda, integrationOptions), {
      
      requestParameters: {
        'method.request.header.InvocationType': false
      },
    });

    // resource.addMethod('OPTIONS', new MockIntegration({
    //   integrationResponses: [{
    //     statusCode: '200',
    //     responseParameters: {
    //       'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
    //       'method.response.header.Access-Control-Allow-Origin': "'*'",
    //       'method.response.header.Access-Control-Allow-Credentials': "'false'",
    //       'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
    //     },
    //   }],
    //   passthroughBehavior: PassthroughBehavior.NEVER,
    //   requestTemplates: {
    //     "application/json": "{\"statusCode\": 200}"
    //   },
    // }), {
    //   methodResponses: [{
    //     statusCode: '200',
    //     responseParameters: {
    //       'method.response.header.Access-Control-Allow-Headers': true,
    //       'method.response.header.Access-Control-Allow-Methods': true,
    //       'method.response.header.Access-Control-Allow-Credentials': true,
    //       'method.response.header.Access-Control-Allow-Origin': true,
    //     },
    //   }]
    // })   


  }
}

export { FlovusStack };
