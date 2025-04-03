#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { DagsterStack } from '../lib/dagster-stack';
import { EcrStack } from '../lib/ecr-stack';

const app = new App();

// const ecrStack = new EcrStack(app, 'DagsterEcrStack');

new DagsterStack(app, 'DagsterStack');
