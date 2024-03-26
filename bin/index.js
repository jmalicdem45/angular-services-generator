#! /usr/bin/env node
'use strict';
const chalk = require("chalk");
const boxen = require("boxen");
const fs = require('fs');
const toPascalCase = require('to-pascal-case');
const { unknownToKebab } = require("to-kebab");
const pluralize = require('pluralize');

const greeting = chalk.white.bold("Generating Interfaces and Services...");

const boxenOptions = {
    padding: 1,
    margin: 1,
    borderColor: "white",
    backgroundColor: "#555555"
};
const msgBox = boxen( greeting, boxenOptions );

console.log(msgBox);

const yargs = require("yargs");
const options = yargs
 .usage("Usage: -s <name>")
 .option("s", { alias: "swagger-name", describe: "Swagger.json name", type: "string", demandOption: true })
 .argv;

 const rawData = fs.readFileSync(options.s);
 const swagger = JSON.parse(rawData);
 const directory = 'interfaces';
 if (!fs.existsSync(directory)) {
     fs.mkdirSync(directory, { recursive: true });
 }
 Object.keys(swagger.components.schemas).forEach(async(key) => {
     if (key === 'ApiResponse') {
         return;
     }
     console.log(`Generating: ${ key } \n`);
     const model = swagger.components.schemas[key];
     const fileName = `${ unknownToKebab(key).toLowerCase() }.interface.ts`;
     fs.writeFileSync(`${ directory }/${ fileName }`, writeFileContents(key, model.properties));
});

const servicesDirectory = 'services';
fs.mkdirSync(servicesDirectory);
swagger.tags.forEach(async(tag) => {
    fs.mkdirSync(`${servicesDirectory}/${tag.name}`);
    const endpoints = Object.keys(swagger.paths).map((path$) => {
        const path = swagger.paths[path$];
        const obj = { tag: tag.name, path: path$, methods: [] }
        if (path?.get?.tags?.includes(tag.name)) {
            obj.methods.push('get')
        }

        if (path?.post?.tags?.includes(tag.name)) {
            obj.methods.push('post')
        }

        if (path?.put?.tags?.includes(tag.name)) {
            obj.methods.push('put')
        }

        if (path?.patch?.tags?.includes(tag.name)) {
            obj.methods.push('patch')
        }

        if (path?.delete?.tags?.includes(tag.name)) {
            obj.methods.push('delete')
        }
        return obj;
    }).filter((c) => c.methods.length);

    const fileName = `${ tag.name }.service.ts`;
    fs.writeFileSync(`${servicesDirectory}/${tag.name}/${fileName}`, writeServiceContents(toPascalCase(tag.name), endpoints));
});

function writeServiceContents(className, endpoints) {
    let serviceContent = 'import { httpClient } from \'\@angular/common/http\'\; \n';
    serviceContent += 'import { Injectable } from \'\@angular/core\'\; \n\n';
    serviceContent += '@Injectable()\n';
    serviceContent += `export class ${className}Service { \n`;
    serviceContent += `     apiUrl = '' //configure api url here\n`;
    serviceContent += `     constructor(private readonly http: httpClient) {}\n\n`;
    serviceContent += writeHttpCalls(endpoints);
    serviceContent += '}'
    return serviceContent;
}

function writeHttpCalls(endpoints) {
    let httpCalls = '';
    endpoints.forEach((e) => {
        e.methods.forEach((method) => {
            const methodName = swagger.paths[e.path][method].operationId;
            const params = swagger.paths[e.path][method]?.parameters;
            
            httpCalls += `      ${methodName}() {\n`;
            httpCalls += `          return this.http.${method}(\`\${this.apiUrl}${e.path}\`\);\n`;
            httpCalls += `      }\n\n`
        });
    })
    return httpCalls;
}


function writeFileContents(modelName, properties) {
    let fileContent = '';
    fileContent += buildImports(properties);
    const className = toPascalCase(modelName);
    fileContent  += `export interface I${ className } { \n${ buildProperties(properties) }}`;

    return fileContent;
}

function buildImports(properties) {
    let imports = '';
    Object.keys(properties).forEach(key => {
        const property = properties[key];
        if (property.type === 'object') {
            imports += `import { I${toPascalCase(key)} } from './${key}.interface'\n;`;
        }
        if (!property.hasOwnProperty('type')) {
            imports +=  `import { I${toPascalCase(key)} } from './${key}.interface';\n`;
        }
        if (property.type === 'array' && !property.items.hasOwnProperty('type')) {
            imports +=  `import { I${toPascalCase(pluralize.singular(key))} } from './${pluralize.singular(key)}.interface';\n`;
        }
    });
    if (imports !== '') {
        imports += '\n';
    }
    return imports;
}

function buildProperties(properties) {
    let content = '';
    Object.keys(properties).forEach(key => {
        const property = properties[key];
        content += `    ${key}: ${ getType(property.type) === '[]' 
        ?`${ property.items.hasOwnProperty('type') ? getType(property.items.type) : 'I'+toPascalCase(pluralize.singular(key)) }[]` 
        :property.hasOwnProperty('type') ? getType(property.type) : 'I'+toPascalCase(pluralize.singular(key)) };\n`;
    });
    return content;
}

function getType(type) {
    switch(type) {
        case 'string':
            return 'string';
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'double':
            return 'number';
        case 'float':
            return 'number';
        case 'array':
            return '[]'
        default:
            return 'any';
    }
}