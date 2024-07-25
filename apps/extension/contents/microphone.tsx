import { useStorage } from '@plasmohq/storage/hook';
import { recorderStateToIcons, type RecorderState } from '@repo/shared';
import cssText from 'data-text:~/style.css';
import type {
	PlasmoCSConfig,
	PlasmoGetInlineAnchorList,
	PlasmoGetStyle,
	PlasmoMountShadowHost,
} from 'plasmo';
import { STORAGE_KEYS } from '~lib/services/extension-storage';
import { toggleRecordingFromContentScript } from './utils/toggleRecordingFromContentScript';

export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () => {
	const allEditableElements = document.querySelectorAll(
		[
			// "input[type='text']",
			// "input[type='search']",
			// "input[type='email']",
			// "input[type='url']",
			// "input[type='tel']",
			// "input[type='password']",
			// "input[type='number']",
			// 'input:not([type])',
			'textarea',
			'[contenteditable="true"]',
			'[contenteditable=""]',
		].join(', '),
	) as NodeListOf<HTMLElement>;

	const editableElements = Array.from(allEditableElements).filter((element) => {
		const style = window.getComputedStyle(element);
		return (
			style.display !== 'none' &&
			style.visibility !== 'hidden' &&
			!element.disabled &&
			!element.readOnly &&
			element.offsetParent !== null &&
			element.getAttribute('aria-readonly') !== 'true' &&
			element.getAttribute('aria-disabled') !== 'true'
		);
	});

	return editableElements.map((element) => ({
		element,
		insertPosition: 'afterend',
	}));
};

export const mountShadowHost: PlasmoMountShadowHost = ({ shadowHost, anchor, mountState }) => {
	if (!anchor?.element) return;
	const editableElement = anchor.element as HTMLElement;

	const wrapper = document.createElement('div');
	wrapper.style.display = 'flex';
	wrapper.style.alignItems = 'center';

	wrapper.style.width = '100%';
	editableElement.style.width = '100%';

	editableElement.parentNode?.insertBefore(wrapper, editableElement);
	wrapper.appendChild(editableElement);
	wrapper.appendChild(shadowHost);

	// mountState?.observer?.disconnect(); // OPTIONAL DEMO: stop the observer as needed
};

export const config: PlasmoCSConfig = {
	matches: ['https://github.com/*'],
	all_frames: true,
};

export const getStyle: PlasmoGetStyle = () => {
	const style = document.createElement('style');
	style.textContent = cssText.replaceAll(':root', ':host(plasmo-csui)');
	return style;
};

function RecorderStateAsIcon() {
	const [recorderState] = useStorage<RecorderState>(STORAGE_KEYS.RECORDER_STATE, 'IDLE');
	const recorderStateAsIcon = recorderStateToIcons[recorderState];
	return (
		<button
			className="group relative z-10 h-10 w-10 rounded-md text-2xl"
			onClick={toggleRecordingFromContentScript}
		>
			<div className="absolute inset-0 rounded-md bg-black bg-opacity-0 transition-opacity duration-300 group-hover:bg-opacity-10"></div>
			{recorderStateAsIcon}
		</button>
	);
}

export default RecorderStateAsIcon;
