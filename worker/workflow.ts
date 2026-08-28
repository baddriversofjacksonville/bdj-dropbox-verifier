import {
	WorkflowEntrypoint,
	WorkflowStep,
} from "cloudflare:workers";

import type {
	WorkflowEvent,
} from "cloudflare:workers";


// ================================================================
// ENVIRONMENT
// ================================================================

interface WorkflowEnv extends Env {
	DROPBOX_ACCESS_TOKEN: string;
}


// ================================================================
// PARAMETERS PASSED FROM JOTFORM WEBHOOK WORKER
// ================================================================

type Params = {
	submissionId: string;
};


type VerificationResult = {
	folderFound: boolean;
	pdfFound: boolean;
	videoFound: boolean;
	safeToPurge: boolean;
	folderPath?: string;
};


const DROPBOX_API =
	"https://api.dropboxapi.com/2";

const ROOT_PATH =
	"/Dash Cams/2 Submissions";


export class MyWorkflow extends WorkflowEntrypoint<
	WorkflowEnv,
	Params
> {

	async run(
		event: WorkflowEvent<Params>,
		step: WorkflowStep
	) {

		const submissionId =
			event.payload.submissionId;


		if (!submissionId) {
			throw new Error(
				"No submissionId was provided to the Workflow."
			);
		}


		console.log(
			`Workflow started for Jotform submission ${submissionId}`
		);


		// ========================================================
		// IMMEDIATE CHECK
		// ========================================================

		let result =
			await step.do(
				"Dropbox check 0 - immediate",
				async () => {

					return await verifyDropboxSubmission(
						this.env.DROPBOX_ACCESS_TOKEN,
						submissionId
					);
				}
			);


		logResult(
			submissionId,
			0,
			result
		);


		if (result.safeToPurge) {

			console.log(
				`SAFE TO PURGE — TEST MODE ONLY — submission ${submissionId}`
			);

			return {
				submissionId,
				status: "safe-to-purge",
				check: 0,
				result
			};
		}


		// ========================================================
		// WAIT 30 SECONDS
		// ========================================================

		await step.sleep(
			"Wait 30 seconds",
			"30 seconds"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			1
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				1,
				result
			);
		}


		// ========================================================
		// WAIT 1 MINUTE
		// ========================================================

		await step.sleep(
			"Wait 1 minute",
			"1 minute"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			2
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				2,
				result
			);
		}


		// ========================================================
		// WAIT 2 MINUTES
		// ========================================================

		await step.sleep(
			"Wait 2 minutes",
			"2 minutes"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			3
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				3,
				result
			);
		}


		// ========================================================
		// WAIT 5 MINUTES
		// ========================================================

		await step.sleep(
			"Wait 5 minutes",
			"5 minutes"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			4
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				4,
				result
			);
		}


		// ========================================================
		// WAIT 10 MINUTES
		// ========================================================

		await step.sleep(
			"Wait 10 minutes",
			"10 minutes"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			5
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				5,
				result
			);
		}


		// ========================================================
		// WAIT 20 MINUTES
		// ========================================================

		await step.sleep(
			"Wait 20 minutes",
			"20 minutes"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			6
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				6,
				result
			);
		}


		// ========================================================
		// WAIT 30 MINUTES
		// ========================================================

		await step.sleep(
			"Wait 30 minutes final",
			"30 minutes"
		);

		result = await runCheck(
			step,
			this.env.DROPBOX_ACCESS_TOKEN,
			submissionId,
			7
		);

		if (result.safeToPurge) {
			return safeResult(
				submissionId,
				7,
				result
			);
		}


		// ========================================================
		// GIVE UP SAFELY
		// ========================================================

		console.log(
			`GAVE UP WAITING — Jotform submission ${submissionId} remains untouched.`
		);


		return {
			submissionId,
			status: "not-safe-to-purge",
			result
		};
	}
}


// ================================================================
// RUN ONE DROPBOX CHECK
// ================================================================

async function runCheck(
	step: WorkflowStep,
	accessToken: string,
	submissionId: string,
	attempt: number
): Promise<VerificationResult> {

	const result =
		await step.do(
			`Dropbox check ${attempt}`,
			async () => {

				return await verifyDropboxSubmission(
					accessToken,
					submissionId
				);
			}
		);


	logResult(
		submissionId,
		attempt,
		result
	);


	return result;
}


// ================================================================
// SAFE RESULT
// ================================================================

function safeResult(
	submissionId: string,
	check: number,
	result: VerificationResult
) {

	console.log(
		`SAFE TO PURGE — TEST MODE ONLY — submission ${submissionId}`
	);


	return {
		submissionId,
		status: "safe-to-purge",
		check,
		result
	};
}


// ================================================================
// VERIFY DROPBOX SUBMISSION
// ================================================================

async function verifyDropboxSubmission(
	accessToken: string,
	submissionId: string
): Promise<VerificationResult> {

	const searchResponse =
		await fetch(
			`${DROPBOX_API}/files/search_v2`,
			{
				method: "POST",

				headers: {
					Authorization:
						`Bearer ${accessToken}`,

					"Content-Type":
						"application/json"
				},

				body: JSON.stringify({
					query: submissionId,

					options: {
						path: ROOT_PATH,
						filename_only: true,
						max_results: 20
					}
				})
			}
		);


	if (!searchResponse.ok) {

		const errorText =
			await searchResponse.text();

		throw new Error(
			`Dropbox search failed: ${searchResponse.status} ${errorText}`
		);
	}


	const searchData: any =
		await searchResponse.json();


	let folderPath:
		string | null =
		null;


	for (
		const match
		of searchData.matches || []
	) {

		const metadata =
			match.metadata?.metadata;


		if (
			metadata?.[".tag"] === "folder" &&
			metadata?.name?.includes(submissionId)
		) {

			folderPath =
				metadata.path_display ||
				metadata.path_lower;

			break;
		}
	}


	if (!folderPath) {

		return {
			folderFound: false,
			pdfFound: false,
			videoFound: false,
			safeToPurge: false
		};
	}


	const listResponse =
		await fetch(
			`${DROPBOX_API}/files/list_folder`,
			{
				method: "POST",

				headers: {
					Authorization:
						`Bearer ${accessToken}`,

					"Content-Type":
						"application/json"
				},

				body: JSON.stringify({
					path: folderPath,
					recursive: false
				})
			}
		);


	if (!listResponse.ok) {

		const errorText =
			await listResponse.text();

		throw new Error(
			`Dropbox folder listing failed: ${listResponse.status} ${errorText}`
		);
	}


	const listData: any =
		await listResponse.json();


	const pdfName =
		`${submissionId}.pdf`;


	const videoExtensions = [
		".mov",
		".mp4",
		".m4v",
		".avi",
		".mkv",
		".webm"
	];


	let pdfFound =
		false;

	let videoFound =
		false;


	for (
		const entry
		of listData.entries || []
	) {

		if (
			entry[".tag"] !== "file"
		) {
			continue;
		}


		const name =
			(entry.name || "")
				.toLowerCase();


		const size =
			Number(
				entry.size || 0
			);


		if (
			name ===
				pdfName.toLowerCase() &&
			size > 0
		) {

			pdfFound =
				true;
		}


		if (
			videoExtensions.some(
				extension =>
					name.endsWith(extension)
			) &&
			size > 0
		) {

			videoFound =
				true;
		}
	}


	return {
		folderFound: true,
		pdfFound,
		videoFound,

		safeToPurge:
			pdfFound &&
			videoFound,

		folderPath
	};
}


// ================================================================
// LOG RESULT
// ================================================================

function logResult(
	submissionId: string,
	attempt: number,
	result: VerificationResult
) {

	console.log(
		`Submission ${submissionId} — Dropbox check ${attempt}`
	);

	console.log(
		`Folder: ${result.folderFound ? "FOUND" : "NOT FOUND"}`
	);

	console.log(
		`PDF: ${result.pdfFound ? "FOUND" : "NOT FOUND"}`
	);

	console.log(
		`Video: ${result.videoFound ? "FOUND" : "NOT FOUND"}`
	);
}
