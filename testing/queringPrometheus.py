import requests
import json
import matplotlib.pyplot as plt
import numpy as np

def makeRequest(request):
  response = requests.get(f'http://localhost:9091/api/v1/query?query={request}').json()
  filterResponse = [result for result in response['data']['result'] if result['metric'].get('path') == "/state-manager" or result['metric'].get('path') == "/wordcount/map"]
  
  return [['State Manager', filterResponse[0]['value'][1]],['Map Reduce',filterResponse[1]['value'][1]]]


def avgDuration():
    count = makeRequest('http_requests_duration_seconds_count')
    totalSum = makeRequest('http_requests_duration_seconds_sum')
    
    avgStateManager = float(totalSum[0][1]) / float(count[0][1])
    avgMapReduce = float(totalSum[1][1]) / float(count[1][1])
    
    return {
        'State Manager': {'count': int(float(count[0][1])), 'total_seconds': float(totalSum[0][1]), 'avg_seconds': avgStateManager},
        'Map Reduce': {'count': int(float(count[1][1])), 'total_seconds': float(totalSum[1][1]), 'avg_seconds': avgMapReduce}
    }


def plotDurations():
    data = avgDuration()
    
    labels = list(data.keys())
    avg_times = [data[label]['avg_seconds'] * 1000 for label in labels]  # Convert to ms
    counts = [data[label]['count'] for label in labels]
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # Average duration bar chart
    ax1.bar(labels, avg_times, color=['#2ecc71', '#3498db'])
    ax1.set_ylabel('Average Duration (ms)')
    ax1.set_title('Average Request Duration')
    for i, v in enumerate(avg_times):
        ax1.text(i, v + 5, f'{v:.2f}ms', ha='center')
    
    # Request count bar chart
    ax2.bar(labels, counts, color=['#2ecc71', '#3498db'])
    ax2.set_ylabel('Request Count')
    ax2.set_title('Total Requests')
    for i, v in enumerate(counts):
        ax2.text(i, v + 2, str(v), ha='center')
    
    plt.tight_layout()
    plt.savefig('duration_metrics.png')
    plt.show()


def printSummary():
    data = avgDuration()
    print("\n===== Fission Function Metrics =====\n")
    for name, metrics in data.items():
        print(f"{name}:")
        print(f"  Total Requests: {metrics['count']}")
        print(f"  Total Duration: {metrics['total_seconds']:.2f}s")
        print(f"  Avg Duration:   {metrics['avg_seconds']*1000:.2f}ms")
        print()


if __name__ == "__main__":
    printSummary()
    plotDurations()
