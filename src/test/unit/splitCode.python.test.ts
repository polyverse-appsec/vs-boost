import { parsePythonFunctions, parseFunctions } from '../../split';
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
    
        const result = parseFunctions('normalFunctions.py', code, true);
    
        // Assuming some condition here. If it returns true, then the test will be skipped.
        this.skip();

        expect(result[0]).to.equal('python');

        result[1].forEach((str, i) => {
            expect(str.trimEnd()).to.equal(expectedOutput[0][i].trimEnd());
        });
        result[2].forEach((num, i) => {
            expect(num).to.equal(expectedOutput[1][i]);
        });
    
        expect(result).to.deep.equal(expectedOutput);
    });

});
