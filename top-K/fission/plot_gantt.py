import json
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D

with open('run-results.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

timings = data.get('mapperTimings', [])
total = len(timings)

valid_timings = sorted(
    [t for t in timings if not t.get('failed')], 
    key=lambda x: x['start']
)
failed_timings = [t for t in timings if t.get('failed')]


fig, ax = plt.subplots(figsize=(8, 6))

palette = ['#7b1fa2', '#f57c00', '#1976d2', '#388e3c', '#d32f2f', '#009688']
node_colors = {}

starts, ends, y_indices = [], [], []


for i, t in enumerate(valid_timings):
    duration = t['end'] - t['start']
    node = t.get('nodeId', f"Worker {i % 4}") # Fallback if nodeId is missing
    
    if node not in node_colors:
        node_colors[node] = palette[len(node_colors) % len(palette)]
        
    ax.barh(i, duration, left=t['start'], color=node_colors[node], 
            height=0.85, edgecolor='none', zorder=2)
    
    starts.append(t['start'])
    ends.append(t['end'])
    y_indices.append(i)


ax.scatter(starts, y_indices, color='#c0ca33', marker='x', s=12, linewidths=1.2, zorder=3)
ax.scatter(ends, y_indices, color='black', marker='x', s=12, linewidths=1.2, zorder=3)


if failed_timings:
    for i, t in enumerate(failed_timings, start=len(valid_timings)):
        ax.barh(i, t['end'] - t['start'], left=t['start'], color='gray', alpha=0.3, height=0.85)
        ax.scatter([t['start']], [i], color='red', marker='x', s=15, zorder=3)


legend_elements = [
    Line2D([0], [0], marker='x', color='w', markeredgecolor='#c0ca33', 
           label='Dispatch Start (x)', markersize=7, markeredgewidth=1.5),
    Line2D([0], [0], marker='x', color='w', markeredgecolor='black', 
           label='Response End (x)', markersize=7, markeredgewidth=1.5),
]


for node, color in list(node_colors.items())[:4]:  # Limit to first 4 nodes to avoid overflow
    legend_elements.append(mpatches.Patch(color=color, label=f'Node: {node}'))

if failed_timings:
    legend_elements.append(mpatches.Patch(color='gray', alpha=0.5, label='Failed Execution'))

ax.legend(handles=legend_elements, loc='lower right', frameon=True, facecolor='white', framealpha=0.9, fontsize=8)


ax.set_xlabel('Time (ms)', fontsize=10)
ax.set_ylabel('Function Invocation (Ordered by Start)', fontsize=10)
ax.grid(True, which='major', linestyle='-', linewidth=0.5, alpha=0.5, zorder=1)
ax.set_ylim(-1, total + 1)


fig.suptitle('Mapper Execution Timeline', fontsize=12, fontweight='bold', y=0.98)
ax.set_title(f'Total Tasks: {total}  |  Visualizing Start/End Jitter & Worker Stragglers', 
             fontsize=8.5, color='#424242', pad=10)

plt.tight_layout()
plt.savefig('gantt_with_legend.png', dpi=300)
print("Saved plot with legend to gantt_with_legend.png")