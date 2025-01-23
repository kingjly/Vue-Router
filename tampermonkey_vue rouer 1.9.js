// ==UserScript==
// @name         Vue Router 信息面板
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  检测网页的 Vue 版本和路由信息，提供可拖动、可缩放的路由面板（性能优化版）
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #vue-router-info-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                max-height: 500px;
                background-color: rgba(255, 255, 255, 0.95);
                border: 2px solid #4fc08d;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                z-index: 9999;
                overflow: hidden;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
                will-change: transform;
                transform: translateZ(0);
            }

            #vue-router-info-panel.dragging {
                transition: none !important;
            }

            #vue-router-info-panel-header {
                background-color: #4fc08d;
                color: white;
                padding: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                cursor: move;
                user-select: none;
            }

            #vue-router-info-panel-content {
                padding: 15px;
                max-height: 400px;
                overflow-y: auto;
            }

            .vue-router-info-item {
                margin-bottom: 10px;
                padding: 8px;
                background-color: #f0f0f0;
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .vue-router-info-link {
                color: #4fc08d;
                text-decoration: none;
                cursor: pointer;
                margin-left: 10px;
            }

            .vue-router-info-link:hover {
                text-decoration: underline;
            }

            .vue-router-info-close {
                cursor: pointer;
                font-weight: bold;
            }

            #vue-router-info-panel.minimized {
                width: 40px;
                height: 40px;
                max-height: 40px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                cursor: move;
                background-color: #4fc08d;
                border-radius: 50%;
                transition: all 0.2s ease;
            }

            #vue-router-info-panel.minimized #vue-router-info-panel-header,
            #vue-router-info-panel.minimized #vue-router-info-panel-content {
                display: none;
            }

            #vue-router-minimized-icon {
                width: 30px;
                height: 30px;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                font-weight: bold;
            }

            #vue-router-info-panel-header .header-controls {
                display: flex;
                align-items: center;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    function findVueRoot(root) {
        const queue = [root];
        while (queue.length > 0) {
            const currentNode = queue.shift();

            if (currentNode.__vue__ || currentNode.__vue_app__ || currentNode._vnode) {
                return currentNode;
            }

            for (let i = 0; i < currentNode.childNodes.length; i++) {
                queue.push(currentNode.childNodes[i]);
            }
        }
        return null;
    }

    function findVueRouter(vueRoot) {
        let router;

        try {
            if (vueRoot.__vue_app__) {
                router = vueRoot.__vue_app__.config.globalProperties.$router.options.routes;
            } else if (vueRoot.__vue__) {
                router = vueRoot.__vue__.$root.$options.router.options.routes;
            }
        } catch (e) {}

        try {
            if (vueRoot.__vue__ && !router) {
                router = vueRoot.__vue__._router.options.routes;
            }
        } catch (e) {}

        return router;
    }

    function walkRouter(rootNode) {
        const stack = [{node: rootNode, path: ''}];
        const routers = [];

        while (stack.length) {
            const { node, path } = stack.pop();

            if (node && typeof node === 'object') {
                if (Array.isArray(node)) {
                    for (const key in node) {
                        stack.push({node: node[key], path: mergePath(path, node[key].path)});
                    }
                } else if (node.hasOwnProperty("children")) {
                    stack.push({node: node.children, path: path});
                }
            }

            if (node && node.path) {
                routers.push({
                    name: node.name || '未命名',
                    path: path,
                    fullPath: node.path
                });
            }
        }

        return routers;
    }

    function mergePath(parent, path) {
        if (path.indexOf(parent) === 0) {
            return path;
        }
        return (parent ? parent + '/' : '') + path;
    }

    function generateRouteLink(routePath) {
        const baseUrl = window.location.origin + window.location.pathname;
        const cleanPath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
        return `${baseUrl}#/${cleanPath}`;
    }

    function makeDraggable(panel) {
        let isDragging = false;
        let startX, startY;
        let initialX, initialY;
        let rafId = null;
        let currentX = 0;
        let currentY = 0;
        const dragThreshold = 5; // 拖动阈值

        function startDrag(e) {
            if (e.target.classList.contains('vue-router-info-close')) return;

            isDragging = true;
            panel.classList.add('dragging');

            const rect = panel.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            startX = e.clientX;
            startY = e.clientY;

            panel.style.cursor = 'grabbing';
            e.preventDefault();
        }

        function doDrag(e) {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // 判断是否超过拖动阈值
            if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
                currentX = dx;
                currentY = dy;

                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
                        rafId = null;
                    });
                }
            }
        }

        function stopDrag(e) {
            if (!isDragging) return;

            isDragging = false;
            panel.classList.remove('dragging');

            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }

            // 应用最终位置
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newX = initialX + dx;
            const newY = initialY + dy;

            // 限制面板在可视区域内
            const panelRect = panel.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + panelRect.width > windowWidth) newX = windowWidth - panelRect.width;
            if (newY + panelRect.height > windowHeight) newY = windowHeight - panelRect.height;

            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
            panel.style.transform = 'none';
            panel.style.cursor = 'move';
        }

        panel.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }

    function createRouterInfoPanel(vueVersion, routers) {
        const panel = document.createElement('div');
        panel.id = 'vue-router-info-panel';

        function createMinimizedIcon() {
            const icon = document.createElement('div');
            icon.id = 'vue-router-minimized-icon';
            icon.textContent = 'V';
            return icon;
        }

        const header = document.createElement('div');
        header.id = 'vue-router-info-panel-header';
        header.innerHTML = `
            <span>Vue Router (v${vueVersion})</span>
            <span id="vue-router-info-close" class="vue-router-info-close">✕</span>
        `;

        const content = document.createElement('div');
        content.id = 'vue-router-info-panel-content';

        // 创建路由列表部分
        const routerList = document.createElement('div');

        // 添加表头
        const tableHeader = document.createElement('div');
        tableHeader.style.display = 'flex';
        tableHeader.style.justifyContent = 'space-between';
        tableHeader.style.fontWeight = 'bold';
        tableHeader.style.marginBottom = '10px'; // 添加底部间距
        tableHeader.innerHTML = `
            <span style="flex: 1; min-width: 100px; text-align: left;">名称</span>
            <span style="flex: 1; min-width: 200px; text-align: left;">路径</span>
        `;
        routerList.appendChild(tableHeader); // 将表头添加到路由列表中

        routers.forEach(router => {
            const routerItem = document.createElement('div');
            routerItem.className = 'vue-router-info-item';

            const routeLink = generateRouteLink(router.fullPath);

            // 合并名称和路径为一行
            routerItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="flex: 1; min-width: 100px; text-align: left;">${router.name}</span>
                    <span style="flex: 1; min-width: 150px; text-align: left;">${router.path}</span>
                    <a href="${routeLink}" class="vue-router-info-link" target="_self">跳转</a>
                </div>
            `;
            routerList.appendChild(routerItem);
        });

        content.appendChild(routerList);
        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);

        const closeBtn = document.getElementById('vue-router-info-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            panel.remove();
        });

        let isDragging = false;
        let startX, startY;
        const dragThreshold = 5; // 拖动阈值

        // 改用 mousedown 和 mouseup 事件处理点击和拖动
        panel.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startY = e.clientY;
            isDragging = false;

            // 如果点击的是关闭按钮，不处理
            if (e.target.id === 'vue-router-info-close') return;
        });

        document.addEventListener('mousemove', (e) => {
            if (startX !== undefined && startY !== undefined) {
                if (Math.abs(e.clientX - startX) > dragThreshold ||
                    Math.abs(e.clientY - startY) > dragThreshold) {
                    isDragging = true;
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (startX !== undefined && startY !== undefined) {
                if (!isDragging) {
                    if (!panel.classList.contains('minimized') &&
                        (e.target === header || header.contains(e.target))) {
                        toggleMinimize();
                    } else if (panel.classList.contains('minimized')) {
                        toggleMinimize();
                    }
                }

                // 重置状态
                startX = undefined;
                startY = undefined;
                isDragging = false;
            }
        });

        function toggleMinimize() {
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
                content.style.display = 'block';
                const minimizedIcon = panel.querySelector('#vue-router-minimized-icon');
                minimizedIcon?.remove(); // 移除缩小图标

                // 确保面板在可视区域内
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                const panelWidth = 350; // 原始宽度
                const panelHeight = 500; // 原始高度
                const rect = panel.getBoundingClientRect();

                let newLeft = rect.left;
                let newTop = rect.top;

                // 调整水平位置
                if (newLeft + panelWidth > windowWidth) {
                    newLeft = windowWidth - panelWidth; // 超过右边界
                }
                if (newLeft < 0) {
                    newLeft = 0; // 超过左边界
                }

                // 调整垂直位置
                if (newTop + panelHeight > windowHeight) {
                    newTop = windowHeight - panelHeight; // 超过下边界
                }
                if (newTop < 0) {
                    newTop = 0; // 超过上边界
                }

                panel.style.left = `${newLeft}px`;
                panel.style.top = `${newTop}px`;
            } else {
                panel.classList.add('minimized');
                content.style.display = 'none';
                const minimizedIcon = createMinimizedIcon();
                panel.appendChild(minimizedIcon);
            }
        }

        makeDraggable(panel);

        return panel;
    }

    function main() {
        const vueRoot = findVueRoot(document.body);
        if (!vueRoot) {
            console.error("该网站未使用 Vue 开发");
            return;
        }

        let vueVersion;
        if (vueRoot.__vue__) {
            vueVersion = vueRoot.__vue__.$options._base.version;
        } else {
            vueVersion = vueRoot.__vue_app__.version;
        }

        const vueRouter = findVueRouter(vueRoot);
        if (!vueRouter) {
            console.error("未检测到 Vue-Router");
            return;
        }

        const routers = walkRouter(vueRouter);
        createRouterInfoPanel(vueVersion, routers);
    }

    addStyles();

    window.addEventListener('load', function() {
        setTimeout(main, 1500);
    });
})();