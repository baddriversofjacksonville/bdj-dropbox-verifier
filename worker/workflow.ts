import {
	WorkflowEntrypoint,
	WorkflowStep,
} from "cloudflare:workers";

import type {
	WorkflowEvent,
} from "cloudflare:workers";


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
	Env,
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
		// RETRY SCHEDULE
		// ========================================================

		const waits = [
			"30 seconds",
			"1 minute",
			"2 minutes",
			"5 minutes",
			"10 minutes",
			"20 minutes",
			"30 minutes",
		];


		// ========================================================
		// FIRST CHECK — IMMEDIATE
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
		// RETRY LOOP
		// ========================================================

		for (
			let i = 0;
			i < waits.length;
			i++
		) {

			const attempt =
				i + 1;

			const waitTime =
				waits[i];


			// ----------------------------------------------------
			// SLEEP DURABLY
			// ----------------------------------------------------

			await step.sleep(
				`Wait before Dropbox check ${attempt}`,
				waitTime
			);


			// ----------------------------------------------------
			// CHECK DROPBOX AGAIN
			// ----------------------------------------------------

			result =
				await step.do(
					`Dropbox check ${attempt}`,
					async () => {

						return await verifyDropboxSubmission(
							this.env.DROPBOX_ACCESS_TOKEN,
							submissionId
						);
					}
				);


			logResult(
				submissionId,
				attempt,
				result
			);


			// ----------------------------------------------------
			// STOP AS SOON AS BOTH FILES EXIST
			// ----------------------------------------------------

			if (result.safeToPurge) {

				console.log(
					`SAFE TO PURGE — TEST MODE ONLY — submission ${submissionId}`
				);

				return {
					submissionId,
					status: "safe-to-purge",
					check: attempt,
					result
				};
			}
		}


		// ========================================================
		// NEVER DELETE IF VERIFICATION FAILED
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
// VERIFY A JOTFORM SUBMISSION IN DROPBOX
// ================================================================

async function verifyDropboxSubmission(
	accessToken: string,
	submissionId: string
): Promise<VerificationResult> {


	// ============================================================
	// SEARCH FOR THE SUBMISSION FOLDER
	// ============================================================

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


	// ============================================================
	// FOLDER DOES NOT EXIST YET
	// ============================================================

	if (!folderPath) {

		return {
			folderFound: false,
			pdfFound: false,
			videoFound: false,
			safeToPurge: false
		};
	}


	// ============================================================
	// LIST FILES INSIDE THE SUBMISSION FOLDER
	// ============================================================

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


	// ============================================================
	// EXPECTED FILE TYPES
	// ============================================================

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


	// ============================================================
	// VERIFY BOTH FILES EXIST AND ARE NONZERO SIZE
	// ============================================================

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
// LOG CHECK RESULT
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
