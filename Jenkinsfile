// Tests ElectronicsInventory's backend and frontend in a Kubernetes Job, then builds the
// electronics-inventory, electronics-inventory-ui and electronics-inventory-docs images and pins
// the first two into ElectronicsInventoryDeploy, which Argo CD syncs to prd.
//
// The images are built from the tree the suite passed on, so `latest` is tagged at build time and
// there is no promote stage.
//
// Controller config:
//   - Job: ElectronicsInventory/ElectronicsInventory
//   - SCM: pvginkel/ElectronicsInventory, branch main
//   - Script Path: Jenkinsfile

library identifier: 'JenkinsPipelineUtils', changelog: false

pipeline {
    agent {
        kubernetes {
            inheritFrom 'jenkins-agent kaniko'
            yamlMergeStrategy merge()
            yaml podYaml(templates: ['k8s'])
        }
    }

    options {
        disableConcurrentBuilds(abortPrevious: true)
        skipDefaultCheckout()
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
    }

    triggers {
        githubPush()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Test') {
            steps {
                script {
                    // S3 comes from a RustFS sidecar rather than shared storage: the backend's test
                    // fixtures abort without a real S3 API, and a throwaway bucket per run keeps
                    // builds from tripping over each other. The backend creates the bucket itself.
                    modernApp.test(
                        job: 'electronics-inventory-validation',
                        install: 'poetry install --no-interaction --without dev',
                        run: 'poetry run',
                        suites: ['backend', 'frontend'],
                        services: [
                            [name: 's3storage', image: 'rustfs/rustfs:latest', env: [
                                RUSTFS_ACCESS_KEY: 's3storage',
                                RUSTFS_SECRET_KEY: 's3storage',
                            ]],
                        ],
                        env: [
                            S3_ENDPOINT_URL: 'http://localhost:9000',
                            S3_ACCESS_KEY_ID: 's3storage',
                            S3_SECRET_ACCESS_KEY: 's3storage',
                            S3_BUCKET_NAME: 'electronics-inventory-validation',
                        ],
                        secrets: [],
                    )
                }
            }
        }

        stage('Build electronics-inventory image') {
            steps {
                container('kaniko') {
                    script {
                        helmCharts.kaniko2(
                            dockerfile: 'backend/Dockerfile',
                            context: 'backend',
                            destinations: [
                                "registry:5000/electronics-inventory:${currentBuild.number}",
                                'registry:5000/electronics-inventory:latest',
                            ]
                        )
                    }
                }
            }
        }

        stage('Build electronics-inventory-ui image') {
            steps {
                // The frontend shows the commit it was built from, and its build context holds no
                // .git to read it from.
                sh 'git rev-parse HEAD > frontend/git-rev'
                container('kaniko') {
                    script {
                        helmCharts.kaniko2(
                            dockerfile: 'frontend/Dockerfile',
                            context: 'frontend',
                            destinations: [
                                "registry:5000/electronics-inventory-ui:${currentBuild.number}",
                                'registry:5000/electronics-inventory-ui:latest',
                            ]
                        )
                    }
                }
            }
        }

        stage('Build electronics-inventory-docs image') {
            steps {
                container('kaniko') {
                    script {
                        helmCharts.kaniko2(
                            dockerfile: 'frontend/Dockerfile.docs',
                            context: 'frontend',
                            destinations: [
                                "registry:5000/electronics-inventory-docs:${currentBuild.number}",
                                'registry:5000/electronics-inventory-docs:latest',
                            ]
                        )
                    }
                }
            }
        }

        stage('Write image pins') {
            steps {
                container('k8s') {
                    script {
                        cicd.writeVersionPins(repo: 'pvginkel/ElectronicsInventoryDeploy', pins: [
                            'config/prd/values.yaml': [
                                'images.electronicsInventory': ":${currentBuild.number}",
                                'images.electronicsInventoryUI': ":${currentBuild.number}",
                            ],
                        ])
                    }
                }
            }
        }
    }
}
