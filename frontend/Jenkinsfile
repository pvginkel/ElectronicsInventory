import org.jenkinsci.plugins.pipeline.modeldefinition.Utils

library('JenkinsPipelineUtils') _

podTemplate(inheritFrom: 'jenkins-agent kaniko') {
    node(POD_LABEL) {
        stage('Cloning repo') {
            git branch: 'main',
                credentialsId: '5f6fbd66-b41c-405f-b107-85ba6fd97f10',
                url: ''
        }

        stage("Building electronics-inventory") {
            sh 'git rev-parse HEAD > git-rev'

            container('kaniko') {
                helmCharts.kaniko([
                    "registry:5000/electronics-inventory:${currentBuild.number}",
                    "registry:5000/electronics-inventory:latest"
                ])
            }
        }

        stage('Deploy Helm charts') {
            build job: 'HelmCharts', wait: false
        }
    }
}
