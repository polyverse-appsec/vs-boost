/*

the basic idea is the engine will take an array of promise generators, and run through them one at a time in serial until 
every promise is successfully resolved.  if a promise fails, then the promise generator is re-run and a new promise is put on the queue.  

the special behavior is that the main array of promises is to be run in groups, as specified by a pattern array.  
thus, if the pattern array is [1, 2, 4, 8], then the first promise is run, followed by *all* of the afterEachGroup promises, 
then two promises from the main array are run, followed by *all* of the afterEachGroup promises, then four promises are run and so forth.\

Initialization: The engine will be initialized with the following arrays of promise generators:
    before: Run at the very beginning of the workflow.
    main: The main group of promise generators.
    afterEachGroup: Run after every group, as specified by the pattern.
    after: Run at the end of the workflow.
    pattern: Specifies the grouping for the main array.

Running the Workflow:
First, the before promises will be run.
Then, the main promises will be run in groups specified by the pattern. After each group, all afterEachGroup promises are run.
If any promise in the main array fails, its generator is re-run, and a new promise is added to the queue.
Finally, the after promises will be run.
Abort: If the abort API is called, the workflow will stop executing further promises.
*/

import { v4 as uuidv4 } from "uuid";
import { errorToString } from "./error";

// Custom error class for handling typed errors
export class WorkflowError extends Error {
    constructor(public type: "retry" | "skip" | "abort" | "cancel", message?: string) {
        super(message);
    }
}

export type PromiseGenerator = () => () => Promise<any>;
export type PromiseGeneratorWithInputs = () => (inputs: any[]) => Promise<any>;
export type BeforeRunPromiseGenerator = PromiseGenerator;
export type AfterEachTaskPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterEachTaskGroupPromiseGenerator = PromiseGeneratorWithInputs;
export type AfterRunPromiseGenerator = PromiseGeneratorWithInputs;

export interface WorkflowEngineOptions {
    beforeRun?: BeforeRunPromiseGenerator[];
    afterEachTask?: AfterEachTaskPromiseGenerator[];
    afterEachTaskGroup?: AfterEachTaskGroupPromiseGenerator[];
    afterRun?: AfterRunPromiseGenerator[];
    pattern?: number[];
    logger?: any;
    maxRetries?: number;
    name?: string;
}

function getElapsedTime(startTime: number): string {
    const elapsedMilliseconds = Date.now() - startTime;
    const elapsedSeconds = elapsedMilliseconds / 1000;

    if (elapsedSeconds < 110) {
        return `${elapsedSeconds.toFixed(2)} secs`;
    } else {
        const elapsedMinutes = elapsedSeconds / 60;
        return `${elapsedMinutes.toFixed(2)} mins`;
    }
}

function getFormattedDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based in JS
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export class WorkflowEngine {
    private beforeRun: BeforeRunPromiseGenerator[];
    private tasks: PromiseGenerator[];
    private afterEachTask: AfterEachTaskPromiseGenerator[];
    private afterEachTaskGroup: AfterEachTaskGroupPromiseGenerator[];
    private afterRun: AfterRunPromiseGenerator[];
    private pattern: number[];
    private aborted: boolean = false;
    private canceled: boolean = false;
    private logger: any;
    private maxRetries: number;
    private retryCounts: Map<PromiseGenerator, number> = new Map(); // To keep track of retries for each promise generator
    private id: string = uuidv4();

    // tasks WILL be modified by the workflow engine - intentionally, enabling processing of the
    //      tasks to be stopped and restarted across runs
    constructor(tasks: PromiseGenerator[], options: WorkflowEngineOptions = {}) {
        this.beforeRun = options.beforeRun || [];
        this.tasks = tasks;
        this.afterEachTask = options.afterEachTask || [];
        this.afterEachTaskGroup = options.afterEachTaskGroup || [];
        this.afterRun = options.afterRun || [];
        this.pattern = options.pattern || [1, 2, 4, 8, 16];
        //default to a no-op function for logger if none is provided
        this.logger = options.logger || undefined;
        this.maxRetries = options.maxRetries || 5;
        this.id = options.name || this.id;

        this.logger?.debug(`${getFormattedDate()}:Workflow(${this.id}):created`);
    }

    public async run() : Promise<any[]> {
        this.aborted = false;
        this.canceled = false;
        const overallStartTime = Date.now();
        let startTime = Date.now();
        let allResults: any[] = [];

        this.logger?.debug(`${getFormattedDate()}:Workflow(${this.id}):Run starting`);

        try {
            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:starting`);

            await this.executePromises(this.beforeRun);

            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:finished:success:${getElapsedTime(startTime)}`);

        } catch (error) {

            this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):beforeRun:finished:error:${getElapsedTime(startTime)}:${errorToString(error)}`);

            allResults.push(error);
            return allResults;
        }

        let patternIndex = 0;
        let groupIndex = 0;
        while (this.tasks.length > 0 && !this.aborted && !this.canceled) {
            const groupSize =
                this.pattern[patternIndex] ||
                this.pattern[this.pattern.length - 1]; // Use the last group size if we've exceeded the pattern

            const taskGroupId = `ring-${groupIndex}-size-${groupSize}`;

            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:starting`);

            let groupResults: any[] = [];

            for (let i = 0; i < groupSize && this.tasks.length > 0 && !this.canceled; i++) {
                if (this.aborted) {
                    return allResults;
                }
                const promiseGenerator = this.tasks.shift()!;
                const promise = promiseGenerator();
                if (!promise.name) {
                    this.logger?.debug(`Workflow(${this.id}):${taskGroupId}:task-${i}:no-name`);
                }
                const taskId = promise.name || uuidv4();
                try {
                    this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:starting`);

                    let result = await promise();

                    this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:finished:success:${getElapsedTime(startTime)}`);

                    groupResults.push(result);

                    startTime = Date.now();
                    try {
                        this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:afterEachTask:starting`);
            
                        await this.executePromisesWithInputs(this.afterEachTask, [
                            result,
                        ]);

                        if (this.retryCounts.has(promiseGenerator)) {
                            this.logger?.info(
                                `${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:afterEachTask:finished:success:afterRetries=${this.retryCounts.get(promiseGenerator)}:${getElapsedTime(startTime)}`);

                            this.retryCounts.delete(promiseGenerator);
                        } else {
                            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:afterEachTask:finished:success:${getElapsedTime(startTime)}`);
                        }
                        
                    } catch (error) {
                        this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:afterEachTask:finished:error:${getElapsedTime(startTime)}:${errorToString(error)}`);
                        allResults.push(error);
                    }

                } catch (error) {
                    // default to retry with generic error
                    let errorType = "retry";

                    // otherwise use the workflow specific requested retry logic
                    if (error instanceof WorkflowError) {
                        errorType = error.type;
                    }
                    
                    switch (errorType) {
                        case "retry":
                            const currentRetries =
                                this.retryCounts.get(promiseGenerator) || 0;
                            if (currentRetries < this.maxRetries + 1) {
                                this.retryCounts.set(
                                    promiseGenerator,
                                    currentRetries + 1
                                );
                                this.tasks.push(promiseGenerator);

                                // we need to retry this iteration of the loop
                                //    so we don't accidentally break out of the group
                                i--;
                            } else {

                                // report the error (after max-retries) as the result of the operation
                                groupResults.push(error);

                                this.logger?.error(
                                    `${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:Max retries reached; Skipping.`
                                );
                                this.retryCounts.delete(promiseGenerator);
                            }
                            break;
                        case "skip":
                            this.logger?.info(
                                `${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:Skipping due to ${(error as Error).message}`
                            );
                            this.retryCounts.delete(promiseGenerator);

                            groupResults.push(error);

                            // Just skip and continue
                            break;

                            // abort will immediately exit the entire workflow process
                        case "abort":
                            this.logger?.error(
                                `${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:Aborting workflow due to ${errorToString(error)}`
                            );
                            this.retryCounts.delete(promiseGenerator);
                            this.abort();

                            // report the error (after abort) as the result of the operation
                            groupResults.push(error);
                            allResults.push(groupResults);

                            return allResults; // Exit the function immediately

                            // cancel will only cancel the current task and group, but still perform end of group
                            //      and end of workflow tasks
                        case "cancel":
                            this.logger?.error(
                                `${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:task-${taskId}:Canceling tasks due to ${errorToString(error)}`
                            );
                            this.retryCounts.delete(promiseGenerator);
                            this.cancel();

                            // note that this task was canceled
                            groupResults.push(error);
                    }
                }
            }

            startTime = Date.now();
            try {
                this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:afterEachTaskGroup:starting`);
    
                await this.executePromisesWithInputs(
                    this.afterEachTaskGroup,
                    groupResults
                );
        
                this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:afterEachTaskGroup:finished:success:${getElapsedTime(startTime)}`);
                
            } catch (error) {
                this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):${taskGroupId}:afterEachTaskGroup:finished:error:${getElapsedTime(startTime)}:${errorToString(error)}`);
                allResults.push(error);
            }
    
            // Move to the next group size if available
            if (patternIndex < this.pattern.length - 1) {
                patternIndex++;
            }
            allResults.push(groupResults);
            groupIndex++;
        }

        startTime = Date.now();
        try {
            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):afterRun:starting`);

            await this.executePromisesWithInputs(this.afterRun, allResults);

            this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):afterRun:finished:success:${getElapsedTime(startTime)}`);
            
        } catch (error) {
            this.logger?.error(`${getFormattedDate()}:Workflow(${this.id}):afterRun:finished:error:${getElapsedTime(startTime)}:${errorToString(error)}`);
            allResults.push(error);
        }

        this.logger?.info(`${getFormattedDate()}:Workflow(${this.id}):Run ended:${getElapsedTime(overallStartTime)}`);

        return allResults;
    }

    // return 0 if no retries, or the first retry count
    // this assumes the number of active tasks is 0 or 1
    get currentTaskRetries() : number {
        if (this.retryCounts.size === 0) {
            return 0;
        } else {
            return this.retryCounts.values().next().value;
        }
    }

    public abort() {
        this.aborted = true;
    }

    public cancel() {
        this.canceled = true;
    }

    private async executePromises(promiseGenerators: PromiseGenerator[]) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator();
        }
    }

    private async executePromisesWithInputs(
        promiseGenerators: PromiseGeneratorWithInputs[],
        inputs: any[]
    ) {
        for (let generatorFactory of promiseGenerators) {
            if (this.aborted) {
                return;
            }
            const generator = generatorFactory();
            await generator(inputs);
        }
    }
}
