/** Runtime-neutral coded errors. UI translations are adapted separately. */
type P = Record<string, string | number>;
type Words = (p: P) => string;

export const ERROR_CODES = [
	"canvas_unavailable",
	"video_decode",
	"video_stalled",
	"read_timeout",
	"video_duration",
	"video_too_large",
	"no_animated_decoder",
	"gif_corrupt",
	"png_encode",
	"no_frames",
	"sheet_too_large",
	"grid_misfit",
	"too_many_frames",
	"image_too_large",
	"editor_not_ready",
	"describe_character",
	"generation_failed",
	"generation_refunded",
	"generation_timeout",
	"no_result_file",
	"download_failed",
	"character_not_ready",
	"upload_type",
	"upload_size",
	"upload_unreadable",
	"upload_limit",
	"upload_busy",
	"network",
	"not_ready",
	"unexpected",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_EN: Record<ErrorCode, Words> = {
		canvas_unavailable: () => "Canvas 2D is not available in this browser.",
		video_decode: () => "This video could not be decoded by your browser (try MP4/H.264 or WebM).",
		video_stalled: () => "The video stopped loading. Browsers pause video in background tabs: keep this tab visible while frames are extracted, then try again.",
		read_timeout: () => "Your browser took too long to read this file. Try a shorter or smaller file.",
		video_duration: () => "Could not read the video duration.",
		video_too_large: (p) => `This video is ${p.mb} MB; the limit is ${p.limit} MB. Trim it to the action you need, or export it at a lower resolution.`,
		no_animated_decoder: () => "Your browser cannot decode this animated image. Save it as a GIF or a video and upload that, or use a recent Chrome, Edge, Firefox or Safari.",
		gif_corrupt: () => "This GIF could not be read. It may be damaged or not really a GIF.",
		png_encode: () => "PNG encoding failed.",
		no_frames: () => "No frames to process.",
		sheet_too_large: (p) => `The sheet would be ${p.w}×${p.h}px (limit ${p.limit}). Use fewer frames, more columns, or pixel-art mode.`,
		grid_misfit: (p) => `A ${p.cols}×${p.rows} grid does not fit a ${p.w}×${p.h} image.`,
		too_many_frames: (p) => `${p.n} frames is too many (limit ${p.limit}).`,
		image_too_large: () => "This image is too large to process in the browser. Use frames of 2048 px or less.",
		editor_not_ready: () => "The editor is not ready yet. Try again in a moment.",
		describe_character: () => "Describe your character in a few words.",
		generation_failed: () => "Generation failed. Check your credit balance on your account page.",
		generation_refunded: () => "Generation failed. Your credits were refunded.",
		generation_timeout: () => "This is taking longer than usual. It keeps running: find it on your account page later.",
		no_result_file: (p) => `The animation finished without a file. Contact support with this id: ${p.id}`,
		download_failed: (p) => `Could not download the generated animation (HTTP ${p.status}).`,
		character_not_ready: () => "The character image is not ready.",
		upload_type: () => "Upload a PNG, JPEG or WebP image of your character.",
		upload_size: () => "The image must be under 10 MB.",
		upload_unreadable: () => "This image could not be opened. Save it again as PNG or JPEG and try once more.",
		upload_limit: (p) => `You can keep up to ${p.limit} uploaded characters. Delete one to upload another.`,
		upload_busy: () => "This image is still being processed. Try again in a moment.",
		network: () => "Could not reach the server. Check your connection and try again.",
		not_ready: () => "Your character image is still being saved. Wait a moment, then continue: this animation request was not charged.",
		unexpected: () => "Something went wrong. Please try again.",
	};

export class UserError extends Error {
	constructor(
		readonly code: ErrorCode,
		readonly params: P = {},
	) {
		super(ERROR_EN[code](params));
		this.name = "UserError";
	}
}

