import {Neovim} from 'neovim-component';
import {remote, shell} from 'electron';
import {join} from 'path';
import {readdirSync} from 'fs';
import {RPCValue} from 'promised-neovim-client';

class ComponentLoader {
    initially_loaded: boolean;
    component_paths: string[];

    constructor() {
        this.initially_loaded = false;
        this.component_paths = [];
    }

    loadPath(path: string) {
        const link = document.createElement('link') as HTMLLinkElement;
        link.rel = 'import';
        link.href = path;
        document.head.appendChild(link);
    }

    loadPluginDir(dir: string) {
        try {
            for (const entry of readdirSync(dir)) {
                if (entry.endsWith('.html')) {
                    this.loadPath(entry);
                    this.component_paths.push(entry);
                }
            }
        } catch (err) {
            // 'nyaovim-plugin' doesn't exist
        }
    }

    loadFromRTP(rtp_string: string) {
        const runtimepaths = rtp_string.split(',');
        for (const rtp of runtimepaths) {
            this.loadPluginDir(join(rtp, 'nyaovim-plugin'));
        }
    }
}

const component_loader = new ComponentLoader();
const ThisBrowserWindow = remote.getCurrentWindow();

Polymer({
    is: 'nyaovim-app',

    properties: {
        argv: {
            type: Array,
            value: function() {
                // Note: First and second arguments are related to Electron
                const a = remote.process.argv.slice(2);
                a.push('-c', 'let\ g:nyaovim_running=1');
                return a;
            },
        },
        editor: Object,
    },

    ready: function() {
        const editor = (document.getElementById('nyaovim-editor') as any).editor as Neovim;
        editor.on('quit', () => remote.require('app').quit());
        this.editor = editor;

        editor.store.on('beep', () => shell.beep());
        editor.store.on('title-changed', () => {
            document.title = editor.store.title;
        });

        editor.on('process-attached', () => {
            const client = editor.getClient();

            client.eval('&runtimepath')
                  .then((rtp: string) => {
                      component_loader.loadFromRTP(rtp);
                      component_loader.initially_loaded = true;
                  });

            client.on('notification', (method: string, args: RPCValue[]) => {
                switch (method) {
                case 'nyaovim:load-path':
                    component_loader.loadPath(args[0] as string);
                    break;
                case 'nyaovim:load-plugin-dir':
                    component_loader.loadPluginDir(args[0] as string);
                    break;
                default:
                    break;
                }
            });
            client.subscribe('nyaovim:load-path');
            client.subscribe('nyaovim:load-plugin-dir');
        });

        window.addEventListener(
            'resize',
            () => editor.screen.resizeWithPixels(window.innerWidth, window.innerHeight) // XXX
        );
    },

    attached: function() {
        // XXX:
        // Temporary fix.  Resize browser window to fit to content
        const [win_width, win_height] = ThisBrowserWindow.getContentSize();
        const canvas = this.editor.screen.canvas;
        if (win_width !== canvas.width || win_height !== canvas.height) {
            ThisBrowserWindow.setContentSize(canvas.width, canvas.height);
        }
    },
});