// Export the Workflow and Durable Object classes
export { MyWorkflow } from "./workflow";
export { WorkflowStatusDO } from "./durable-object";


/**
 * Main Worker fetch handler
 *
 * API routes:
 *
 * POST /api/workflow/start
 * Starts a Dropbox verification Workflow.
 *
 * Expected JSON:
 * {
 *   "submissionId": "6637543001025961942"
 * }
 *
 * GET /api/workflow/status/:id
 * Returns Cloudflare Workflow instance status.
 *
 * GET /ws
 * Retains the starter template's WebSocket status support.
 */

export default {
	async fetch(
		request: Request,
		env: Env
	): Promise<Response> {

		const url =
			new URL(request.url);


		// ============================================================
		// START WORKFLOW
		// ============================================================

		if (
			url.pathname === "/api/workflow/start" &&
			request.method === "POST"
		) {

			try {

				const body =
					(await request.json()) as {
						submissionId?: string;
					};


				const submissionId =
					body.submissionId?.trim();


				if (!submissionId) {

					return Response.json(
						{
							error:
								"submissionId is required"
						},
						{
							status: 400
						}
					);
				}


				const instance =
					await env.MY_WORKFLOW.create({
						params: {
							submissionId
						}
					});


				return Response.json({
					instanceId:
						instance.id,

					submissionId,

					message:
						"Dropbox verification workflow started successfully"
				});

			} catch (error) {

				console.error(
					"Failed to start workflow:",
					error
				);


				return Response.json(
					{
						error:
							"Failed to start workflow"
					},
					{
						status: 500
					}
				);
			}
		}


		// ============================================================
		// GET WORKFLOW STATUS
		// ============================================================

		if (
			url.pathname.startsWith(
				"/api/workflow/status/"
			) &&
			request.method === "GET"
		) {

			const instanceId =
				url.pathname
					.split("/")
					.pop();


			if (!instanceId) {

				return Response.json(
					{
						error:
							"Instance ID required"
					},
					{
						status: 400
					}
				);
			}


			try {

				const instance =
					await env.MY_WORKFLOW.get(
						instanceId
					);


				const status =
					await instance.status();


				return Response.json(
					status
				);

			} catch (error) {

				console.error(
					"Failed to get workflow status:",
					error
				);


				return Response.json(
					{
						error:
							"Failed to get workflow status"
					},
					{
						status: 500
					}
				);
			}
		}


		// ============================================================
		// WEBSOCKET STATUS SUPPORT
		// ============================================================

		if (
			url.pathname === "/ws"
		) {

			const instanceId =
				url.searchParams.get(
					"instanceId"
				);


			if (!instanceId) {

				return new Response(
					"instanceId query parameter required",
					{
						status: 400
					}
				);
			}


			const upgradeHeader =
				request.headers.get(
					"Upgrade"
				);


			if (
				upgradeHeader !==
				"websocket"
			) {

				return new Response(
					"Expected Upgrade: websocket",
					{
						status: 426
					}
				);
			}


			try {

				const doId =
					env.WORKFLOW_STATUS.idFromName(
						instanceId
					);


				const stub =
					env.WORKFLOW_STATUS.get(
						doId
					);


				return stub.fetch(
					request
				);

			} catch (error) {

				console.error(
					"WebSocket connection failed:",
					error
				);


				return new Response(
					"Failed to establish WebSocket connection",
					{
						status: 500
					}
				);
			}
		}


		// ============================================================
		// BASIC STATUS PAGE
		// ============================================================

		if (
			url.pathname === "/" &&
			request.method === "GET"
		) {

			return Response.json({
				service:
					"BDJ Dropbox Verifier",

				status:
					"running",

				mode:
					"TEST MODE - NO JOTFORM DELETION"
			});
		}


		return Response.json(
			{
				error:
					"Not Found"
			},
			{
				status: 404
			}
		);
	}

} satisfies ExportedHandler<Env>;
