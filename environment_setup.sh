#minikube setup
minikube stop
minikube delete --all
minikube start --nodes=5 --cpus=4 --memory=8192

#fission install
export FISSION_NAMESPACE="fission"
kubectl create namespace $FISSION_NAMESPACE
kubectl create -k "github.com/fission/fission/crds/v1?ref=v1.22.0"
helm repo add fission-charts https://fission.github.io/fission-charts/
helm repo update
helm install --version 1.22.1 --namespace $FISSION_NAMESPACE fission \
  --set serviceType=NodePort,routerServiceType=NodePort \
  fission-charts/fission-all

#prometheus install
export METRICS_NAMESPACE=monitoring
kubectl create namespace $METRICS_NAMESPACE
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring

helm upgrade fission fission-charts/fission-all --namespace fission -f values.yaml

#Port forward
sleep 20
kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-prometheus 9091:9090 &
kubectl port-forward -n fission svc/router 9090:80 &

#startup
cd map-reduce
./setup.sh &
watch -n 1 'kubectl get pods -n default --no-headers | awk "{print \$3}" | sort | uniq -c'
