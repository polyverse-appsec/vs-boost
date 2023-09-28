import {
    parsePythonFunctions,
    languageParserSettings
} from '../../utilities/languageParsers';
import { parseFunctions } from '../../utilities/sourceLoader';
import { expect } from 'chai';
import path from 'path';
import fs from 'fs';
import { Context } from 'mocha';

describe('Python Parse Unit', () => {

    const dataFolder = __dirname + "/data/";

    it('should work in normal case', () => {
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.py'), 'utf8');
        const firstFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.first.py'), 'utf8');
        const secondFunction = fs.readFileSync(path.join(dataFolder, 'normalFunctions.second.py'), 'utf8');

        const expectedOutput: [string[], number[]] = [
            [
                firstFunction,
                secondFunction
            ],
            [1, 5]
        ];

        const result = parsePythonFunctions(code);
        result[0].forEach((str, i) => {
            const expected = expectedOutput[0][i];
            const actual = str;
            expect(actual).to.equal(expected);
        });
        result[1].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
        
        expect(result).to.deep.equal(expectedOutput);
    });

    it('aggregator work in normal case', function(this: Context) { 
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.py'), 'utf8');
    
        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];
    
        try {
            languageParserSettings.useNewParser = true;          

            const result = parseFunctions('normalFunctions.py', code, true);
        
            if (!languageParserSettings.useNewParser &&
                !languageParserSettings.useNewParserForPython) {
                // Assuming some condition here. If it returns true, then the test will be skipped.
                this.skip();
            }

            expect(result[0]).to.equal('python');

            result[1].forEach((str, i) => {
                expect(str).to.equal(expectedOutput[0][i]);
            });
            result[2].forEach((num, i) => {
                expect(num).to.equal(expectedOutput[1][i]);
            });
        } finally {
            languageParserSettings.useNewParser = false;
        }

    });

    it('aggregator work with leading whitespace', function(this: Context) { 
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.leadingWhitespace.py'), 'utf8');
    
        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];
    
        try {
            languageParserSettings.useNewParser = true;          

            const result = parseFunctions('normalFunctions.leadingWhitespace.py', code, true);
        
            if (!languageParserSettings.useNewParser &&
                !languageParserSettings.useNewParserForPython) {
                // Assuming some condition here. If it returns true, then the test will be skipped.
                this.skip();
            }

            expect(result[0]).to.equal('python');

            result[1].forEach((str, i) => {
                expect(str).to.equal(expectedOutput[0][i]);
            });
            result[2].forEach((num, i) => {
                expect(num).to.equal(expectedOutput[1][i]);
            });
        } finally {
            languageParserSettings.useNewParser = false;
        }

    });

    it('aggregator work with no inbetween space', function(this: Context) { 
        const code = fs.readFileSync(path.join(dataFolder, 'normalFunctions.noInbetweenSpace.py'), 'utf8');
    
        const expectedOutput: [string[], number[]] = [
            [
                code,
            ],
            [1]
        ];
    
        try {
            languageParserSettings.useNewParser = true;          

            const result = parseFunctions('normalFunctions.noInbetweenSpace.py', code, true);
        
            if (!languageParserSettings.useNewParser &&
                !languageParserSettings.useNewParserForPython) {
                // Assuming some condition here. If it returns true, then the test will be skipped.
                this.skip();
            }

            expect(result[0]).to.equal('python');

            result[1].forEach((str, i) => {
                expect(str).to.equal(expectedOutput[0][i]);
            });
            result[2].forEach((num, i) => {
                expect(num).to.equal(expectedOutput[1][i]);
            });
        } finally {
            languageParserSettings.useNewParser = false;
        }

    });
});
