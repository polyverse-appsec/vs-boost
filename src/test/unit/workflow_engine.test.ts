import { expect } from "chai";
import { PromiseGenerator, WorkflowEngine, WorkflowError } from "../../utilities/workflow_engine";

describe("WorkflowEngine", () => {
    it("should run promises in the correct order", function (done) {
        let log: string[] = [];

        const beforeRun = [
            () => async () => {
                log.push("beforeRun");
                return;
            },
        ];
        const tasks = [
            () => async () => {
                log.push("main1");
                return 1;
            },
            () => async () => {
                log.push("main2");
                return 2;
            },
            () => async () => {
                log.push("main3");
                return 3;
            },
            () => async () => {
                log.push("main4");
                return 4;
            },
        ];
        const afterEachTask = [
            () => async () => {
                console.log(log);
                return;
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                log.push("afterEachTaskGroup");
                return;
            },
        ];
        const afterRun = [
            () => async () => {
                log.push("afterRun");
                return;
            },
        ];

        const pattern = [1, 2];

        const engine = new WorkflowEngine(tasks, {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
            name: (this as any).test.title,
        });

        engine.run().then(allResults => {
            expect(allResults.length).to.equal(3);

            expect(allResults[0].length).to.equal(1);
            expect(allResults[0][0]).to.equal(1);
    
            expect(allResults[1].length).to.equal(2);
            expect(allResults[1][0]).to.equal(2);
            expect(allResults[1][1]).to.equal(3);
    
            expect(allResults[2].length).to.equal(1);
            expect(allResults[2][0]).to.equal(4);
    
            expect(log).to.deep.equal([
                "beforeRun",
                "main1",
                "afterEachTaskGroup",
                "main2",
                "main3",
                "afterEachTaskGroup",
                "main4",
                "afterEachTaskGroup",
                "afterRun",
            ]);
            done(); // We use done to tell Mocha that our test has completed
        }).catch(err => {
            done(err); // Pass the error to done() to handle test failure
        });

    });

    it("Simulate N files processed in the correct order", function () {
        let log: string[] = [];

        const beforeRun = [
            () => async () => {
                log.push("beforeRun");
                return;
            },
        ];
        const files = ["file1", "file2", "file3", "file4", "file5", "file6", "file7", "file8", "file9", "file10"];
        const tasks : PromiseGenerator[] =
            files.map((file) => {
                return () => {
                    return async () => {
                        return new Promise<string>(
                            (resolve, reject) => {
                                try
                                {
                                    log.push(`Processed: ${file}`);
                                    resolve(file);
                                } catch (error) {
                                    reject(error);
                                }
                            });
                        };
                    };
            });
        const afterEachTask = [
            () => async () => {
                console.log(log);
                return;
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                log.push("afterEachTaskGroup");
                return;
            },
        ];
        const afterRun = [
            () => async () => {
                log.push("afterRun");
                return;
            },
        ];

        const pattern = [1, 2];

        const engine = new WorkflowEngine(tasks as PromiseGenerator[], {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
            name: (this as any).test.title,
        });
        return engine.run().then(() => {

            expect(log).to.deep.equal(
                [
                    "beforeRun",
                    "Processed: file1",
                    "afterEachTaskGroup",
                    "Processed: file2",
                    "Processed: file3",
                    "afterEachTaskGroup",
                    "Processed: file4",
                    "Processed: file5",
                    "afterEachTaskGroup",
                    "Processed: file6",
                    "Processed: file7",
                    "afterEachTaskGroup",
                    "Processed: file8",
                    "Processed: file9",
                    "afterEachTaskGroup",
                    "Processed: file10",
                    "afterEachTaskGroup",
                    "afterRun",
                ]
            );
        });
    });

    // More tests can be written to verify other functionalities...
    it("should handle closure state properly", function () {
        //create an array of 5 random numbers
        let randomNumbers: number[] = [];
        for (let i = 0; i < 5; i++) {
            //create a random number that is an integer between 0 and 100
            randomNumbers.push(Math.floor(Math.random() * 100));
        }
        //get the sum for double checking
        let sum = randomNumbers.reduce((a, b) => a + b, 0);
        //now put each number into a promise generator
        let promiseGenerators: (() => () => Promise<number>)[] = [];
        for (let i = 0; i < 5; i++) {
            promiseGenerators.push(() => {
                return async () => {
                    return randomNumbers[i];
                };
            });
        }
        //now create a summary promise generator. use a closure to keep track of the sum, with a variable here on
        //the outside of the closure to check the sum later
        let sumCheck = 0;
        let summaryPromiseGenerator = () => {
            return async (inputs: any[]) => {
                //the inputs are the results of the previous promises
                sumCheck += inputs.reduce((a: number, b: number) => a + b, 0);
                return sumCheck as any;
            };
        };
        //now create the engine
        const engine = new WorkflowEngine(promiseGenerators, {
            afterEachTaskGroup: [summaryPromiseGenerator],
            name: (this as any).test.title,
        });
        //run the engine
        return engine.run().then(() => {
            //check the sum
            expect(sumCheck).to.equal(sum);
        });
    });

    it('should retry on "retry" type error', function(done) { // Notice `function` instead of an arrow function
        let log: string[] = [];
        let retryCount = 0;
    
        const tasks = [
            () => async () => {
                if (retryCount < 2) {
                    retryCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                    return "main";
                }
            },
        ];
    
        // Using "this.test.title" without casting
        const engine = new WorkflowEngine(tasks, { name: (this as any).test.title });
        engine.run().then(allResults => {
            expect(allResults.length).to.equal(1);
            expect(allResults[0].length).to.equal(1);
            expect(allResults[0][0]).to.equal("main");
    
            expect(log).to.deep.equal(["main"]);
            expect(retryCount).to.equal(2);
            done(); // We use done to tell Mocha that our test has completed
        }).catch(err => {
            done(err); // Pass the error to done() to handle test failure
        });
    });    

    it('should retry on generic task error', function () {
        let log: string[] = [];
        let retryCount = 0;

        const tasks = [
            () => async () => {
                if (retryCount < 2) {
                    retryCount++;
                    throw new Error("Test Generic Error retry");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine : WorkflowEngine = new WorkflowEngine(tasks, { name: (this as any).test.title });
        return engine.run().then(() => {
            expect(log).to.deep.equal(["main"]);
            expect(retryCount).to.equal(2);
        });
    });

    it('should skip on "skip" type error', function () {
        let log: string[] = [];
    
        const tasks = [
            () => async () => {
                throw new WorkflowError("skip", "Skip error");
            },
            () => async () => {
                log.push("main");
                return "main";
            },
        ];
    
        const afterRun = [
            () => async (taskResults: any[]) => {
                expect(taskResults.length).to.equal(2);
                expect(taskResults[0].length).to.equal(1);
                expect(taskResults[0][0] instanceof WorkflowError).to.equal(true);
                expect(taskResults[0][0].type).to.equal("skip");
        
                expect(taskResults[1].length).to.equal(1);
                expect(taskResults[1][0]).to.equal("main");
                return;
            },
        ];
    
        const engine : WorkflowEngine = new WorkflowEngine(tasks, {
                afterRun: afterRun,
                name: (this as any).test.title,
            });
    
        return engine.run().then(allResults => {
            afterRun[0]()(allResults);
            expect(log).to.deep.equal(["main"]);
        });
    });    

    it('should abort on "abort" type error', function() {
        let log: string[] = [];
    
        const tasks = [
            () => async () => {
                throw new WorkflowError("abort", "Abort error");
            },
            () => async () => {
                log.push("main");
            },
        ];
    
        const engine : WorkflowEngine = new WorkflowEngine(tasks, { name: (this as any).test.title });
        return engine.run().then(allResults => {
            expect(allResults.length).to.equal(1);
            expect(allResults[0].length).to.equal(1);
            expect(allResults[0][0] instanceof WorkflowError).to.equal(true);
    
            expect(log).to.deep.equal([]);
        });
    });
    
    it('should cancel on "cancel" type error', function() {
        let log: string[] = [];
    
        const tasks = [
            () => async () => {
                log.push("main1");
                return "main1";
            },
            () => async () => {
                throw new WorkflowError("cancel", "Cancel error");
            },
            () => async () => {
                log.push("main2");
                return "main2";
            },
        ];
    
        const beforeRun = [
            () => async () => {
                log.push("beforeRun");
                return;
            },
        ];
        const afterEachTask = [
            () => async () => {
                log.push("afterEachTask");
                return;
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                log.push("afterEachTaskGroup");
                return;
            },
        ];
        const afterRun = [
            () => async () => {
                log.push("afterRun");
                return;
            },
        ];
    
        const engine : WorkflowEngine = new WorkflowEngine(tasks,
            {
                beforeRun: beforeRun,
                afterEachTask: afterEachTask,
                afterEachTaskGroup: afterEachTaskGroup,
                afterRun: afterRun,
                name: (this as any).test.title,
            });
        return engine.run().then(allResults => {
            expect(allResults.length).to.equal(2);
            expect(allResults[0].length).to.equal(1);
            expect(allResults[0][0]).to.equal("main1");
            expect(allResults[1].length).to.equal(1);
            expect(allResults[1][0] instanceof WorkflowError).to.equal(true);
    
            expect(log).to.deep.equal([
                "beforeRun",
                "main1",
                "afterEachTask",
                "afterEachTaskGroup",
                "afterEachTaskGroup",
                "afterRun",
            ]);
        });
    });    
    
    it("should allow a 'then' after run command", function() {
        const engine : WorkflowEngine = new WorkflowEngine([], { name: (this as any).test.title });
        const result = engine.run();
    
        // Check if run() returns a Promise
        expect(result).to.be.an.instanceOf(Promise);
    
        let thenWorked = false;
    
        // Here, we're using the done() function provided by Mocha to handle asynchronous tests.
        return result.then(() => { 
            thenWorked = true;
            expect(thenWorked).to.be.true;
        });
    });

    it("should respect maxRetries option with WorkflowError", function () {
        let log: string[] = [];
        let executionCount = 0;

        const tasks = [
            () => async () => {
                if (executionCount < 4) {
                    executionCount++;
                    throw new WorkflowError("retry", "Retry error");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine : WorkflowEngine = new WorkflowEngine(tasks, {
            maxRetries: 1,
            name: (this as any).test.title,
        }); // Setting maxRetries to 1 should only retry once
        return engine.run().then(() => {
            expect(engine.currentTaskRetries).to.equal(0); // retry count should be reset

            expect(log).to.deep.equal([]); // Since maxRetries is 1, the promise should not be successful and "main" won't be logged
            expect(executionCount).to.equal(3); // Should only retry 1 times, so total executions is 3
        });
    });

    it("should respect maxRetries option with Generic Error", function () {
        let log: string[] = [];
        let executionCount = 0;

        const tasks = [
            () => async () => {
                if (executionCount < 4) {
                    executionCount++;
                    throw new Error("Unknown Error object - to test general retry");
                } else {
                    log.push("main");
                }
            },
        ];

        const engine : WorkflowEngine = new WorkflowEngine(tasks, {
            maxRetries: 1,
            name: (this as any).test.title,
        }); // Setting maxRetries to 1 should only retry once
        return engine.run().then(() => {
            expect(engine.currentTaskRetries).to.equal(0); // retry count should be reset

            expect(log).to.deep.equal([]); // Since maxRetries is 1, the promise should not be successful and "main" won't be logged
            expect(executionCount).to.equal(3); // Should only retry 1 times, so total executions is 3
        });
    });});
