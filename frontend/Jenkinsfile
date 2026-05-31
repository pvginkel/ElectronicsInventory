import org.jenkinsci.plugins.pipeline.modeldefinition.Utils

library('JenkinsPipelineUtils') _

podTemplate(inheritFrom: 'jenkins-agent kaniko') {
    node(POD_LABEL) {
        stage('Cloning repo') {
            checkout scm
        }

        stage("Building electronics-inventory") {
            def gitRev = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()

            writeFile file: 'git-rev', text: gitRev

            container('kaniko') {
                helmCharts.kaniko([
                    "registry:5000/electronics-inventory-ui:${currentBuild.number}"
                ])
            }

            writeJSON file: 'frontend-build.json', json: [tag: ":${currentBuild.number}", gitRev: gitRev]
            archiveArtifacts artifacts: 'frontend-build.json', fingerprint: true
        }

        stage("Building electronics-inventory contributor documentation") {
            container('kaniko') {
                helmCharts.kaniko(
                    "Dockerfile.docs",
                    ".",
                    [
                        "registry:5000/electronics-inventory-docs:${currentBuild.number}",
                        "registry:5000/electronics-inventory-docs:latest"
                    ]
                )
            }
        }

        stage('Start validation') {
            build job: 'ElectronicsInventory/Validation',
                wait: false,
                parameters: [
                    string(name: 'FRONTEND_BUILD', value: "${currentBuild.number}"),
                    string(name: 'TRIGGERED_BY', value: 'frontend')
                ]
        }
    }
}
