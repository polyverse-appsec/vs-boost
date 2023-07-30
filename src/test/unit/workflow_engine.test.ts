import { expect } from 'chai';
import { WorkflowEngine } from '../../workflow_engine';

describe('WorkflowEngine', () => {
    it('should run promises in the correct order', async () => {
        let log: string[] = [];

        const beforeGen = [() => async () => { log.push('before'); return; }] ;
        const main = [
            () => async () => { log.push('main1'); return; },
            () => async () => { log.push('main2'); return; },
            () => async () => { log.push('main3'); return; },
            () => async () => { log.push('main4'); return; }
        ];
        const afterEach = [() => async () => { console.log(log); return; }];
        const afterEachGroup = [() => async () => { log.push('afterEachGroup'); return; }];
        const afterGen = [() => async () => { log.push('after'); return; }];
        
         
        const pattern = [1, 2];

        const engine = new WorkflowEngine(beforeGen, main, afterEach, afterEachGroup, afterGen, pattern);
        await engine.run();

        expect(log).to.deep.equal(['before', 'main1', 'afterEachGroup', 'main2', 'main3', 'afterEachGroup', 'main4', 'afterEachGroup', 'after']);
    });

    // More tests can be written to verify other functionalities...
});

