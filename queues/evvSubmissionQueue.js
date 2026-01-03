import { Queue, Worker } from "bullmq";
import { processSubmissionJob } from "../services/evvSubmissionWorker.js";

const queueName = "evv-submissions";
const useInMemory = process.env.EVV_IN_MEMORY_QUEUE === "1";

const connection = process.env.REDIS_URL
  ? { connection: { url: process.env.REDIS_URL } }
  : { connection: { host: "127.0.0.1", port: 6379 } };

const evvSubmissionQueue = useInMemory ? null : new Queue(queueName, connection);

const inMemoryQueue = {
  jobs: [],
  running: false,
  async add({ visitId, adjudicator }) {
    this.jobs.push({ visitId, adjudicator });
    await this.run();
  },
  async run() {
    if (this.running) return;
    this.running = true;
    while (this.jobs.length) {
      const job = this.jobs.shift();
      await processSubmissionJob({ data: job });
    }
    this.running = false;
  },
};

export function enqueueVisitSubmission({ visitId, adjudicator = "HHAX" }) {
  if (useInMemory) {
    return inMemoryQueue.add({ visitId, adjudicator });
  }
  const jobId = `${adjudicator}:${visitId}`;
  return evvSubmissionQueue.add(
    "submit",
    { visitId, adjudicator },
    { jobId, removeOnComplete: 500, removeOnFail: 500 }
  );
}

export function startEvvSubmissionWorker() {
  if (useInMemory) {
    return null;
  }
  return new Worker(queueName, processSubmissionJob, connection);
}

export { evvSubmissionQueue };
