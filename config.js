"use strict";

const path = require("node:path");

module.exports = {
	port: Number(process.env.PORT || 3000),
	dataFile: path.resolve(
		process.env.DATA_FILE || path.join(__dirname, "data", "guesses.csv"),
	),
	resultsUser: process.env.RESULTS_USER || "manager",
	resultsPassword: process.env.RESULTS_PASSWORD,
	minGuess: Number(process.env.MIN_GUESS || 20000000),
	maxGuess: Number(process.env.MAX_GUESS || 50000000),
	submissionsClose:
		process.env.SUBMISSIONS_CLOSE || "2026-12-01T00:00:00-05:00",
	trustProxy: process.env.TRUST_PROXY === "1",
};
